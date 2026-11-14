"""Backend API FastAPI desacoplado con streaming SSE paso a paso, HITL y Memoria Dual."""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import threading
from collections.abc import Iterator
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from src.agent.evaluator import run_full_m2_evaluation
from src.agent.graph import get_agent_runtime
from src.agent.memory import get_memory_manager
from src.agent.rag_qdrant import get_rag_engine
from src.agent.tools_structured import load_sales_rows
from src.core.config import config
from src.core.llm_factory import is_llm_online

from api.schemas import (
    ChatRequest,
    ForkThreadRequest,
    HealthResponse,
    HITLDecisionRequest,
    InjectionTrapRequest,
)

ROOT_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="Tecnoquímicas S.A. — AI Agent API (Módulo 2)",
    description=(
        "Backend desacoplado en FastAPI para el Agente Conversacional LangGraph con "
        "streaming ReAct, Memoria Dual (SqliteSaver + Store), RAG Híbrido Qdrant, "
        "Router Jev, Blindaje anti-inyección y HITL en vivo."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _format_sse(event: str, data: object) -> str:
    payload = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event}\ndata: {payload}\n\n"


@app.get("/api/v1/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Verifica conectividad de Qdrant, SqliteSaver, Gemini/Ollama y LangSmith."""
    rag = get_rag_engine()
    mem = get_memory_manager()
    runtime = get_agent_runtime()
    active_label = f"{config.get_active_model()} ({config.get_active_provider()})"
    return HealthResponse(
        status="ok",
        company=config.empresa,
        llm_model=active_label,
        ollama_available=is_llm_online(),
        langsmith_tracing=runtime.langsmith_active,
        qdrant_stats=rag.stats(),
        threads_count=len(mem.list_threads()),
    )


@app.post("/api/v1/chat/stream")
def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Ejecuta el agente en modo streaming SSE emitiendo Thought/Action/Observation/HITL/Token."""
    runtime = get_agent_runtime()

    def event_generator() -> Iterator[str]:
        try:
            for item in runtime.stream_turn(
                thread_id=req.thread_id,
                query=req.message,
                user_id=req.user_id,
            ):
                yield _format_sse(item["event"], item["data"])
        except Exception as exc:
            yield _format_sse("error", {"message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/v1/chat/message")
def chat_message(req: ChatRequest) -> dict:
    """Ejecuta un turno completo y retorna respuesta + traza estructurada JSON."""
    runtime = get_agent_runtime()
    return runtime.run_turn(
        thread_id=req.thread_id,
        query=req.message,
        user_id=req.user_id,
    )


@app.post("/api/v1/chat/hitl")
def chat_hitl_resume(req: HITLDecisionRequest) -> StreamingResponse:
    """Reanuda un hilo pausado por HITL enviando `Command(resume=...)` por SSE."""
    runtime = get_agent_runtime()

    def event_generator() -> Iterator[str]:
        try:
            for item in runtime.stream_hitl_resume(
                thread_id=req.thread_id,
                decision=req.decision,
                edited_args=req.edited_args,
                user_id=req.user_id,
            ):
                yield _format_sse(item["event"], item["data"])
        except Exception as exc:
            yield _format_sse("error", {"message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.get("/api/v1/threads")
def list_threads() -> dict:
    """Lista los hilos conversacionales persistidos en SqliteSaver."""
    mem = get_memory_manager()
    return {"threads": mem.list_threads()}


@app.get("/api/v1/threads/{thread_id}")
def get_thread_detail(thread_id: str) -> dict:
    """Recupera el historial completo, trazas ReAct y checkpoints Time-Travel de un hilo."""
    mem = get_memory_manager()
    runtime = get_agent_runtime()
    traces = mem.get_turn_traces(thread_id)
    checkpoints = mem.list_checkpoints(thread_id)
    snapshot = runtime.graph.get_state({"configurable": {"thread_id": thread_id}})
    pending_interrupt = None
    if snapshot and snapshot.tasks:
        for task in snapshot.tasks:
            if getattr(task, "interrupts", None):
                pending_interrupt = getattr(task.interrupts[0], "value", None)
                break

    return {
        "thread_id": thread_id,
        "traces": traces,
        "checkpoints": checkpoints,
        "pending_interrupt": pending_interrupt,
    }


@app.post("/api/v1/threads/{thread_id}/fork")
def fork_thread(thread_id: str, req: ForkThreadRequest) -> dict:
    """Time-Travel: bifurca un hilo desde un checkpoint previo hacia un nuevo thread_id."""
    mem = get_memory_manager()
    traces = mem.get_turn_traces(thread_id)
    if not traces:
        raise HTTPException(status_code=404, detail="Hilo origen sin trazas para bifurcar.")
    new_id = mem.fork_thread_traces(
        source_thread_id=thread_id,
        checkpoint_id=req.checkpoint_id,
        new_thread_id=req.new_thread_id,
    )
    return {
        "source_thread_id": thread_id,
        "new_thread_id": new_id,
        "checkpoint_id": req.checkpoint_id,
    }


@app.delete("/api/v1/threads/{thread_id}")
def delete_thread(thread_id: str) -> dict:
    """Elimina un hilo y sus checkpoints asociados."""
    mem = get_memory_manager()
    deleted = mem.delete_thread(thread_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Hilo '{thread_id}' no encontrado.")
    return {"deleted": True, "thread_id": thread_id}


@app.get("/api/v1/memory/store")
def get_long_term_memory(user_id: str = Query(default="default_user")) -> dict:
    """Consulta los recuerdos y perfil de usuario en el Store de largo plazo por namespace."""
    mem = get_memory_manager()
    return mem.get_user_profile(user_id=user_id)


@app.post("/api/v1/rag/inject-test")
def toggle_injection_trap(req: InjectionTrapRequest) -> dict:
    """Activa o desactiva el documento con prompt injection indirecto para la demo en vivo."""
    rag = get_rag_engine()
    enabled = rag.set_injection_trap(req.enabled)
    return {
        "trap_enabled": enabled,
        "stats": rag.stats(),
    }


@app.get("/api/v1/eval/metrics")
def get_evaluation_metrics() -> dict:
    """Retorna métricas Recall@5, Recall@10, nDCG@10, Router Accuracy y dataset CSV."""
    metrics_path = ROOT_DIR / config.m2_eval_metrics_path
    if metrics_path.exists():
        with open(metrics_path, encoding="utf-8") as f:
            metrics = json.load(f)
    else:
        metrics = run_full_m2_evaluation(save_report=True)

    sales_preview = [r.model_dump() for r in load_sales_rows() if r.anio == 2025]
    return {
        "evaluation": metrics,
        "sales_2025_preview": sales_preview,
    }


def _run_taskkill(pid: int | str, creation_flags: int) -> None:
    """Termina de forma silenciosa un árbol de procesos en Windows."""
    with contextlib.suppress(Exception):
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            creationflags=creation_flags,
            timeout=3,
        )


def _kill_port_listeners(port_raw: str | None, current_pid: int) -> None:
    """Termina en Windows cualquier proceso TCP en escucha sobre el puerto indicado."""
    if os.name != "nt" or not port_raw or not port_raw.isdigit():
        return
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        raw = subprocess.check_output(
            ["netstat", "-ano", "-p", "tcp"],
            creationflags=creation_flags,
            timeout=3,
        )
        out = raw.decode("cp850", errors="ignore")
    except Exception:
        return

    pids: set[int] = set()
    suffix = f":{port_raw}"
    for line in out.splitlines():
        parts = line.split()
        if (
            len(parts) >= 5
            and parts[3].upper() in {"LISTENING", "ESCUCHANDO"}
            and parts[1].endswith(suffix)
            and parts[4].isdigit()
        ):
            pid = int(parts[4])
            if pid not in {0, current_pid}:
                pids.add(pid)

    for pid in pids:
        _run_taskkill(pid, creation_flags)


def _release_ports_and_shutdown() -> None:
    """Cierra SQLite/Qdrant, detiene Frontend/Launcher y finaliza el backend FastAPI."""
    try:
        with contextlib.suppress(Exception):
            get_memory_manager().conn.close()
        with contextlib.suppress(Exception):
            get_rag_engine().close()

        current_pid = os.getpid()
        with contextlib.suppress(Exception):
            frontend_port = os.getenv("TQ_FRONTEND_PORT")
            if frontend_port:
                _kill_port_listeners(frontend_port, current_pid)
            else:
                for probe_port in range(5173, 5181):
                    _kill_port_listeners(str(probe_port), current_pid)

            backend_port = os.getenv("TQ_BACKEND_PORT")
            if backend_port:
                _kill_port_listeners(backend_port, current_pid)

            launcher_pid = os.getenv("TQ_LAUNCHER_PID")
            if (
                os.name == "nt"
                and launcher_pid
                and launcher_pid.isdigit()
                and int(launcher_pid) != current_pid
            ):
                _run_taskkill(launcher_pid, getattr(subprocess, "CREATE_NO_WINDOW", 0))
    finally:
        os._exit(0)


@app.post("/api/v1/system/shutdown")
def shutdown_system(dry_run: bool = Query(default=False)) -> dict[str, object]:
    """Apaga de forma segura FastAPI, Vite, SQLite y Qdrant liberando los puertos TCP."""
    if not dry_run:
        timer = threading.Timer(0.8, _release_ports_and_shutdown)
        timer.daemon = True
        timer.start()
    return {
        "status": "shutting_down",
        "dry_run": dry_run,
        "message": "Cerrando SQLite/Qdrant, deteniendo servidores y liberando puertos TCP.",
    }
