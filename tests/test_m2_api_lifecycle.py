"""Pruebas unitarias e integración para endpoints de ciclo de vida y errores API."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient
from src.agent.graph import TecnoquimicasAgentRuntime
from src.agent.memory import DualMemoryManager
from src.agent.rag_qdrant import HybridQdrantRAG

from api.main import app


def _isolated_client_deps(tmp_path):
    mem = DualMemoryManager(
        checkpoint_db_path=str(tmp_path / "api_life.sqlite"),
        store_path=str(tmp_path / "api_store.json"),
    )
    rag = HybridQdrantRAG(persist_path=":memory:")
    rt = TecnoquimicasAgentRuntime(memory_manager=mem, rag_engine=rag, use_live_llm=False)
    return mem, rag, rt


def test_api_health_exposes_model_and_qdrant_stats(tmp_path) -> None:
    """Valida que /api/v1/health exponga modelo activo, LangSmith y puntos de Qdrant."""
    mem, rag, rt = _isolated_client_deps(tmp_path)
    try:
        with (
            patch("api.main.get_agent_runtime", return_value=rt),
            patch("api.main.get_memory_manager", return_value=mem),
            patch("api.main.get_rag_engine", return_value=rag),
        ):
            client = TestClient(app)
            resp = client.get("/api/v1/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "ok"
            assert "llm_model" in data
            assert data["qdrant_stats"]["points_count"] >= 7
    finally:
        mem.conn.close()
        rag.close()


def test_api_missing_thread_and_fork_returns_404(tmp_path) -> None:
    """Valida respuesta HTTP 404 al consultar o bifurcar un thread_id inexistente."""
    mem, rag, rt = _isolated_client_deps(tmp_path)
    try:
        with (
            patch("api.main.get_agent_runtime", return_value=rt),
            patch("api.main.get_memory_manager", return_value=mem),
            patch("api.main.get_rag_engine", return_value=rag),
        ):
            client = TestClient(app)
            get_resp = client.get("/api/v1/threads/hilo-inexistente-999")
            fork_resp = client.post("/api/v1/threads/hilo-inexistente-999/fork", json={})
            assert get_resp.status_code == 404
            assert fork_resp.status_code == 404
    finally:
        mem.conn.close()
        rag.close()


def test_api_shutdown_dry_run_preserves_process(tmp_path) -> None:
    """Valida que POST /api/v1/system/shutdown?dry_run=true responde cleanly sin matar pytest."""
    mem, rag, rt = _isolated_client_deps(tmp_path)
    try:
        with (
            patch("api.main.get_agent_runtime", return_value=rt),
            patch("api.main.get_memory_manager", return_value=mem),
            patch("api.main.get_rag_engine", return_value=rag),
        ):
            client = TestClient(app)
            resp = client.post("/api/v1/system/shutdown?dry_run=true")
            assert resp.status_code == 200
            payload = resp.json()
            assert payload["status"] == "shutting_down"
            assert payload["dry_run"] is True
    finally:
        mem.conn.close()
        rag.close()
