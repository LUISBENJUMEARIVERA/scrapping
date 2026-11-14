"""Backend API FastAPI desacoplado con streaming SSE paso a paso, HITL y Memoria Dual."""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from src.agent.evaluator import run_full_m2_evaluation
from src.agent.graph import configure_langsmith_env, get_agent_runtime
from src.agent.memory import get_memory_manager
from src.agent.rag_qdrant import get_rag_engine
from src.agent.tools_structured import load_sales_rows
from src.chains.tasks import KnowledgeService
from src.core.config import config
from src.core.llm_factory import is_llm_online

from api.schemas import (
    ChatRequest,
    ForkThreadRequest,
    HealthResponse,
    HITLDecisionRequest,
    InjectionTrapRequest,
    M1StreamRequest,
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


@app.get("/api/v1/m1/overview")
def get_modulo1_overview() -> dict:
    """Retorna métricas Medallion, Corpus Gold SHA-256 y resultados de benchmark del Módulo 1."""
    metrics_path = ROOT_DIR / config.output_gold_metrics
    if metrics_path.exists():
        with open(metrics_path, encoding="utf-8") as f_m:
            medallion_metrics = json.load(f_m)
    else:
        medallion_metrics = {
            "total_urls_target": 8,
            "total_pages_scraped": 6,
            "total_tokens": 2551,
            "noise_discarded_bytes": 845069,
            "noise_reduction_ratio_pct": 98.4,
        }

    gold_docs: list[dict] = []
    gold_path = ROOT_DIR / config.output_gold_jsonl
    if gold_path.exists():
        with open(gold_path, encoding="utf-8") as f_g:
            for line in f_g:
                if line.strip():
                    item = json.loads(line)
                    gold_docs.append(
                        {
                            "section": item.get("section", "Sección"),
                            "title": item.get("title", "Documento TQ"),
                            "url": item.get("url", ""),
                            "content_hash": item.get("content_hash", ""),
                            "token_count": item.get("token_count", 0),
                            "char_count": item.get("char_count", 0),
                        }
                    )

    bench_path = ROOT_DIR / "data" / "evaluation" / "benchmark_results.md"
    benchmark_markdown = bench_path.read_text(encoding="utf-8") if bench_path.exists() else ""

    return {
        "llm_model": f"{config.get_active_model()} ({config.get_active_provider()})",
        "langsmith_tracing": configure_langsmith_env(),
        "medallion_metrics": medallion_metrics,
        "gold_docs": gold_docs,
        "benchmark_markdown": benchmark_markdown,
        "has_architecture_html": (ROOT_DIR / "docs" / "arquitectura.html").exists(),
    }


@app.post("/api/v1/m1/stream")
def stream_modulo1_lcel(req: M1StreamRequest) -> StreamingResponse:
    """Ejecuta en streaming SSE las cadenas LCEL del Módulo 1 con el motor Gemini/Ollama."""
    configure_langsmith_env()
    m1_service = KnowledgeService()

    def event_generator() -> Iterator[str]:
        started = time.perf_counter()
        yield _format_sse(
            "meta",
            {
                "task": req.task,
                "llm_model": config.get_active_model(),
                "provider": config.get_active_provider(),
            },
        )
        try:
            if req.task == "summary":
                stream = m1_service.get_summary_stream()
            elif req.task == "faq":
                stream = m1_service.get_faq_stream()
            else:
                if not req.question.strip():
                    yield _format_sse("error", {"message": "Ingresa una pregunta para Q&A."})
                    return
                stream = m1_service.answer_question_stream(req.question.strip())

            full_text = ""
            for chunk in stream:
                if chunk:
                    full_text += chunk
                    yield _format_sse("token", {"delta": chunk})

            latency_ms = int((time.perf_counter() - started) * 1000)
            yield _format_sse(
                "done",
                {"latency_ms": latency_ms, "length": len(full_text)},
            )
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


@app.post("/api/v1/m1/run-pytest")
def run_modulo1_pytest() -> dict:
    """Ejecuta la suite automatizada pytest en vivo y retorna su salida de consola."""
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "-v", "--tb=short"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(ROOT_DIR),
        timeout=60,
    )
    return {
        "returncode": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


@app.get("/api/v1/m1/architecture-html", response_class=HTMLResponse)
def get_modulo1_architecture_html() -> HTMLResponse:
    """Sirve el mapa interactivo Archify del Módulo 1 (`docs/arquitectura.html`)."""
    arch_file = ROOT_DIR / "docs" / "arquitectura.html"
    if not arch_file.exists():
        raise HTTPException(status_code=404, detail="Archivo docs/arquitectura.html no encontrado.")
    return HTMLResponse(content=arch_file.read_text(encoding="utf-8"))


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
