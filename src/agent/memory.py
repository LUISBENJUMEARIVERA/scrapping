"""Sistema de Memoria Dual: Corto plazo (SqliteSaver), Largo plazo (Store) y Context Trimming."""

from __future__ import annotations

import contextlib
import json
import re
import sqlite3
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from langchain_core.messages import BaseMessage, SystemMessage, trim_messages
from langchain_core.messages.utils import count_tokens_approximately
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.store.memory import InMemoryStore
from src.core.config import config

ROOT_DIR = Path(__file__).resolve().parent.parent.parent


class PersistentMemoryStore(InMemoryStore):
    """Store de largo plazo compatible con LangGraph BaseStore y persistencia en JSON."""

    def __init__(self, persist_path: str | Path | None = None) -> None:
        super().__init__()
        self._lock = threading.Lock()
        if persist_path is None:
            raw = Path(config.long_term_store_path)
            self.persist_path: Path | None = raw if raw.is_absolute() else ROOT_DIR / raw
        elif str(persist_path) == ":memory:":
            self.persist_path = None
        else:
            p = Path(persist_path)
            self.persist_path = p if p.is_absolute() else ROOT_DIR / p

        self._load_from_disk()

    def _load_from_disk(self) -> None:
        if not self.persist_path or not self.persist_path.exists():
            return
        try:
            with open(self.persist_path, encoding="utf-8") as f:
                records = json.load(f)
            for rec in records:
                ns = tuple(rec["namespace"])
                super().put(ns, rec["key"], rec["value"])
        except Exception:
            # Si el JSON estuviera corrupto, arranca limpio sin bloquear el agente
            pass

    def _save_to_disk(self) -> None:
        if not self.persist_path:
            return
        self.persist_path.parent.mkdir(parents=True, exist_ok=True)
        serialized: list[dict[str, Any]] = []
        for ns in self.list_namespaces():
            items = self.search(ns, limit=500)
            for item in items:
                serialized.append(
                    {
                        "namespace": list(item.namespace),
                        "key": item.key,
                        "value": item.value,
                    }
                )
        with open(self.persist_path, "w", encoding="utf-8") as f:
            json.dump(serialized, f, ensure_ascii=False, indent=2)

    def put(
        self,
        namespace: tuple[str, ...],
        key: str,
        value: dict[str, Any],
        index: list[str] | bool | None = None,
        *,
        ttl: float | None = None,
    ) -> None:
        with self._lock:
            super().put(namespace, key, value, index=index, ttl=ttl)
            self._save_to_disk()

    def delete(self, namespace: tuple[str, ...], key: str) -> None:
        with self._lock:
            super().delete(namespace, key)
            self._save_to_disk()


def trim_conversation_context(
    messages: list[BaseMessage],
    max_tokens: int | None = None,
) -> dict[str, Any]:
    """Recorta el historial multi-turno preservando SystemMessage y últimos turnos coherentes."""
    limit = max_tokens or config.max_context_tokens
    original_tokens = count_tokens_approximately(messages) if messages else 0
    original_count = len(messages)

    if not messages or original_tokens <= limit:
        return {
            "messages": messages,
            "trimmed": False,
            "original_count": original_count,
            "kept_count": original_count,
            "original_tokens": original_tokens,
            "kept_tokens": original_tokens,
            "max_tokens": limit,
        }

    trimmed = trim_messages(
        messages,
        max_tokens=limit,
        strategy="last",
        token_counter=count_tokens_approximately,
        include_system=True,
        allow_partial=False,
        start_on="human",
    )
    if not trimmed and messages:
        # Garantiza conservar al menos el último mensaje del usuario + sistema
        sys_msgs = [m for m in messages if isinstance(m, SystemMessage)]
        trimmed = [*sys_msgs[:1], messages[-1]]

    kept_tokens = count_tokens_approximately(trimmed)
    return {
        "messages": trimmed,
        "trimmed": len(trimmed) < original_count,
        "original_count": original_count,
        "kept_count": len(trimmed),
        "original_tokens": original_tokens,
        "kept_tokens": kept_tokens,
        "max_tokens": limit,
    }


def extract_user_facts(text: str) -> dict[str, str]:
    """Extrae hechos clave de perfil de usuario (nombre, empresa, cargo, preferencia)."""
    facts: dict[str, str] = {}
    clean_text = text.strip()

    # Ignorar preguntas sobre el perfil ("¿Cómo me llamo?", "¿Dónde trabajo?", "¿Recuerdas...?")
    is_question = (
        "?" in clean_text
        or "¿" in clean_text
        or bool(
            re.search(
                r"\b(c[oó]mo\s+me\s+llamo|d[oó]nde\s+trabajo|recuerdas|cu[aá]l\s+es\s+mi)\b",
                clean_text,
                re.IGNORECASE,
            )
        )
    )
    if is_question:
        return facts

    name_match = re.search(
        r"(?:me\s+llamo|mi\s+nombre\s+es)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){0,2})",
        clean_text,
        re.IGNORECASE,
    )
    if name_match:
        candidate = name_match.group(1).strip(" .,;:")
        candidate = re.split(
            r"\s+(?:y|en|soy|trabajo|donde|d[oó]nde|c[oó]mo)\b",
            candidate,
            flags=re.IGNORECASE,
        )[0]
        if candidate and candidate.lower() not in {
            "como",
            "cómo",
            "donde",
            "dónde",
            "quien",
            "quién",
        }:
            facts["nombre"] = candidate.strip().title()

    work_match = re.search(
        r"(?:trabajo\s+en|laboro\s+en|pertenezco\s+a|soy\s+de\s+la\s+empresa)\s+"
        r"([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s\.\-&]{2,40})",
        clean_text,
        re.IGNORECASE,
    )
    if work_match:
        company = work_match.group(1).strip(" .,;:")
        company = re.split(r"[.,;]|\s+(?:y\s+soy|prefiero|como)\b", company, flags=re.IGNORECASE)[0]
        if company:
            facts["empresa"] = company.strip()

    role_match = re.search(
        r"(?:mi\s+cargo\s+es|soy)\s+(directora?|gerente|ingenier[oa]|analista|coordinador[a]?|"
        r"jefe|investigador[a]?|estudiante|profesor[a]?|consultor[a]?)"
        r"(?:\s+de\s+[A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,25})?",
        clean_text,
        re.IGNORECASE,
    )
    if role_match:
        role_raw = re.sub(
            r"^(?:mi\s+cargo\s+es|soy)\s+", "", role_match.group(0), flags=re.IGNORECASE
        )
        role_clean = re.split(
            r"\s+(?:y\s+trabajo|en\s+la\s+empresa|,|\.)\b", role_raw, flags=re.IGNORECASE
        )[0]
        if role_clean:
            facts["cargo"] = role_clean.strip(" .,;:")

    pref_match = re.search(
        r"(?:prefiero|me\s+gustan?)\s+(respuestas?\s+[A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,40})",
        clean_text,
        re.IGNORECASE,
    )
    if pref_match:
        facts["preferencia_formato"] = pref_match.group(1).strip(" .,;:")

    return facts


class DualMemoryManager:
    """Coordina Checkpointer de corto plazo (SqliteSaver) y Store de largo plazo."""

    def __init__(
        self,
        checkpoint_db_path: str | None = None,
        store_path: str | None = None,
    ) -> None:
        raw_db = (
            checkpoint_db_path if checkpoint_db_path is not None else config.sqlite_checkpoint_path
        )
        if raw_db == ":memory:":
            self.db_path = ":memory:"
            self.conn = sqlite3.connect(":memory:", check_same_thread=False)
        else:
            p = Path(raw_db) if Path(raw_db).is_absolute() else ROOT_DIR / raw_db
            p.parent.mkdir(parents=True, exist_ok=True)
            self.db_path = str(p)
            self.conn = sqlite3.connect(self.db_path, check_same_thread=False)

        self._lock = threading.Lock()
        self.checkpointer = SqliteSaver(self.conn)
        self.checkpointer.setup()
        self._init_metadata_tables()

        self.store = PersistentMemoryStore(persist_path=store_path)

    def _init_metadata_tables(self) -> None:
        with self._lock:
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS thread_metadata (
                    thread_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_choice TEXT DEFAULT '',
                    parent_thread_id TEXT DEFAULT NULL,
                    forked_from_checkpoint TEXT DEFAULT NULL
                )
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS thread_traces (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    thread_id TEXT NOT NULL,
                    checkpoint_id TEXT,
                    user_query TEXT NOT NULL,
                    assistant_response TEXT NOT NULL,
                    router_decision_json TEXT NOT NULL,
                    steps_json TEXT NOT NULL,
                    citations_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            self.conn.commit()

    def touch_thread(
        self,
        thread_id: str,
        user_id: str = "default_user",
        title: str | None = None,
        last_choice: str = "",
        parent_thread_id: str | None = None,
        forked_from_checkpoint: str | None = None,
    ) -> None:
        now = datetime.now(UTC).isoformat()
        with self._lock:
            cur = self.conn.execute(
                "SELECT thread_id, title FROM thread_metadata WHERE thread_id = ?",
                (thread_id,),
            )
            row = cur.fetchone()
            if row is None:
                resolved_title = title or f"Hilo {thread_id[:8]}"
                self.conn.execute(
                    """
                    INSERT INTO thread_metadata
                    (thread_id, user_id, title, created_at, updated_at, last_choice,
                     parent_thread_id, forked_from_checkpoint)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        thread_id,
                        user_id,
                        resolved_title,
                        now,
                        now,
                        last_choice,
                        parent_thread_id,
                        forked_from_checkpoint,
                    ),
                )
            else:
                new_title = title if title else row[1]
                self.conn.execute(
                    """
                    UPDATE thread_metadata
                    SET updated_at = ?, title = ?, last_choice = ?
                    WHERE thread_id = ?
                    """,
                    (now, new_title, last_choice, thread_id),
                )
            self.conn.commit()

    def record_turn_trace(
        self,
        thread_id: str,
        checkpoint_id: str | None,
        user_query: str,
        assistant_response: str,
        router_decision: dict[str, Any],
        steps: list[dict[str, Any]],
        citations: list[dict[str, Any]],
    ) -> None:
        now = datetime.now(UTC).isoformat()
        with self._lock:
            self.conn.execute(
                """
                INSERT INTO thread_traces
                (thread_id, checkpoint_id, user_query, assistant_response,
                 router_decision_json, steps_json, citations_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    thread_id,
                    checkpoint_id,
                    user_query,
                    assistant_response,
                    json.dumps(router_decision, ensure_ascii=False),
                    json.dumps(steps, ensure_ascii=False),
                    json.dumps(citations, ensure_ascii=False),
                    now,
                ),
            )
            self.conn.commit()

    def get_turn_traces(self, thread_id: str) -> list[dict[str, Any]]:
        with self._lock:
            cur = self.conn.execute(
                """
                SELECT id, checkpoint_id, user_query, assistant_response,
                       router_decision_json, steps_json, citations_json, created_at
                FROM thread_traces
                WHERE thread_id = ?
                ORDER BY id ASC
                """,
                (thread_id,),
            )
            rows = cur.fetchall()
        traces: list[dict[str, Any]] = []
        for row in rows:
            traces.append(
                {
                    "trace_id": row[0],
                    "checkpoint_id": row[1],
                    "user_query": row[2],
                    "assistant_response": row[3],
                    "router_decision": json.loads(row[4]),
                    "steps": json.loads(row[5]),
                    "citations": json.loads(row[6]),
                    "created_at": row[7],
                }
            )
        return traces

    def list_threads(self) -> list[dict[str, Any]]:
        with self._lock:
            cur = self.conn.execute(
                """
                SELECT m.thread_id, m.user_id, m.title, m.created_at, m.updated_at,
                       m.last_choice, m.parent_thread_id, m.forked_from_checkpoint,
                       (SELECT COUNT(*) FROM thread_traces t WHERE t.thread_id = m.thread_id) AS turns
                FROM thread_metadata m
                ORDER BY m.updated_at DESC
                """
            )
            rows = cur.fetchall()
        return [
            {
                "thread_id": r[0],
                "user_id": r[1],
                "title": r[2],
                "created_at": r[3],
                "updated_at": r[4],
                "last_choice": r[5],
                "parent_thread_id": r[6],
                "forked_from_checkpoint": r[7],
                "turns": r[8],
            }
            for r in rows
        ]

    def delete_thread(self, thread_id: str) -> bool:
        with self._lock:
            self.conn.execute("DELETE FROM thread_traces WHERE thread_id = ?", (thread_id,))
            cur = self.conn.execute("DELETE FROM thread_metadata WHERE thread_id = ?", (thread_id,))
            # Limpiar también checkpoints en las tablas internas de SqliteSaver
            for table in ("checkpoints", "writes"):
                with contextlib.suppress(sqlite3.OperationalError):
                    self.conn.execute(f"DELETE FROM {table} WHERE thread_id = ?", (thread_id,))
            self.conn.commit()
            return cur.rowcount > 0

    def list_checkpoints(self, thread_id: str, limit: int = 25) -> list[dict[str, Any]]:
        """Lista los checkpoints persistidos en SqliteSaver para inspección y Time-Travel."""
        items = list(
            self.checkpointer.list({"configurable": {"thread_id": thread_id}}, limit=limit)
        )
        result: list[dict[str, Any]] = []
        for idx, cp_tuple in enumerate(items):
            cfg = cp_tuple.config.get("configurable", {})
            cp_id = cfg.get("checkpoint_id", "")
            channel_vals = cp_tuple.checkpoint.get("channel_values", {})
            msgs = channel_vals.get("messages", [])
            last_msg_preview = ""
            if msgs:
                content = getattr(msgs[-1], "content", "")
                last_msg_preview = str(content)[:120]
            result.append(
                {
                    "index": idx,
                    "checkpoint_id": cp_id,
                    "parent_checkpoint_id": (
                        cp_tuple.parent_config.get("configurable", {}).get("checkpoint_id")
                        if cp_tuple.parent_config
                        else None
                    ),
                    "step": cp_tuple.metadata.get("step") if cp_tuple.metadata else None,
                    "source": cp_tuple.metadata.get("source") if cp_tuple.metadata else None,
                    "message_count": len(msgs),
                    "preview": last_msg_preview,
                    "ts": cp_tuple.checkpoint.get("ts"),
                }
            )
        return result

    def sync_long_term_memory(self, user_id: str, user_text: str) -> dict[str, Any]:
        """Extrae hechos del usuario, los guarda en el Store por namespace y retorna el perfil."""
        namespace = ("users", user_id, "profile")
        extracted = extract_user_facts(user_text)
        now = datetime.now(UTC).isoformat()

        for key, value in extracted.items():
            self.store.put(
                namespace,
                key,
                {"fact": value, "updated_at": now, "source_text": user_text[:160]},
            )

        profile_items = self.store.search(namespace, limit=50)
        profile = {item.key: item.value.get("fact", "") for item in profile_items}
        return {
            "namespace": list(namespace),
            "newly_saved": extracted,
            "profile": profile,
        }

    def get_user_profile(self, user_id: str = "default_user") -> dict[str, Any]:
        """Recupera todos los hechos del Store de largo plazo mediante `search()`."""
        namespace = ("users", user_id, "profile")
        items = self.store.search(namespace, limit=50)
        return {
            "namespace": list(namespace),
            "items": [
                {
                    "key": item.key,
                    "value": item.value,
                }
                for item in items
            ],
            "summary": {item.key: item.value.get("fact", "") for item in items},
        }

    def fork_thread_traces(
        self,
        source_thread_id: str,
        checkpoint_id: str | None = None,
        new_thread_id: str | None = None,
    ) -> str:
        """Crea un nuevo hilo bifurcado copiando trazas hasta el punto seleccionado."""
        target_id = new_thread_id or f"fork-{uuid.uuid4().hex[:8]}"
        traces = self.get_turn_traces(source_thread_id)
        kept_traces: list[dict[str, Any]] = []
        for t in traces:
            kept_traces.append(t)
            if checkpoint_id and t.get("checkpoint_id") == checkpoint_id:
                break

        self.touch_thread(
            thread_id=target_id,
            title=f"Fork de {source_thread_id[:8]}",
            parent_thread_id=source_thread_id,
            forked_from_checkpoint=checkpoint_id,
        )
        for t in kept_traces:
            self.record_turn_trace(
                thread_id=target_id,
                checkpoint_id=t.get("checkpoint_id"),
                user_query=t["user_query"],
                assistant_response=t["assistant_response"],
                router_decision=t["router_decision"],
                steps=t["steps"],
                citations=t["citations"],
            )
        return target_id


_memory_singleton: DualMemoryManager | None = None
_memory_singleton_lock = threading.Lock()


def get_memory_manager() -> DualMemoryManager:
    """Retorna la instancia singleton del gestor de memoria dual."""
    global _memory_singleton
    with _memory_singleton_lock:
        if _memory_singleton is None:
            _memory_singleton = DualMemoryManager()
        return _memory_singleton
