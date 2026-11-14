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


def test_api_missing_thread_fork_and_delete_behavior(tmp_path) -> None:
    """Valida estado vacío en GET /threads/{id} y 404 al bifurcar o eliminar hilo inexistente."""
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
            del_resp = client.delete("/api/v1/threads/hilo-inexistente-999")
            assert get_resp.status_code == 200
            assert get_resp.json()["traces"] == []
            assert fork_resp.status_code == 404
            assert del_resp.status_code == 404
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


def test_api_m1_overview_and_stream_tasks(tmp_path) -> None:
    """Valida GET /api/v1/m1/overview y POST /api/v1/m1/stream para tareas qa y summary."""
    mem, rag, rt = _isolated_client_deps(tmp_path)

    class _FakeService:
        def answer_question_stream(self, question: str):
            yield f"Respuesta grounded para: {question}"

        def get_summary_stream(self):
            yield "Resumen ejecutivo del corpus."

        def get_faq_stream(self):
            yield "FAQ corporativo."

    try:
        with (
            patch("api.main.get_agent_runtime", return_value=rt),
            patch("api.main.get_memory_manager", return_value=mem),
            patch("api.main.get_rag_engine", return_value=rag),
            patch("api.main.KnowledgeService", return_value=_FakeService()),
        ):
            client = TestClient(app)
            ov_resp = client.get("/api/v1/m1/overview")
            assert ov_resp.status_code == 200
            ov = ov_resp.json()
            assert "llm_model" in ov
            assert "medallion_metrics" in ov
            assert "gold_docs" in ov

            qa_resp = client.post(
                "/api/v1/m1/stream",
                json={"task": "qa", "question": "¿Qué planta opera en Cali?"},
            )
            assert qa_resp.status_code == 200
            assert "event: token" in qa_resp.text
            assert "Respuesta grounded para:" in qa_resp.text
            assert "event: done" in qa_resp.text

            sum_resp = client.post(
                "/api/v1/m1/stream",
                json={"task": "summary", "question": ""},
            )
            assert sum_resp.status_code == 200
            assert "Resumen ejecutivo del corpus." in sum_resp.text
    finally:
        mem.conn.close()
        rag.close()


def test_m1_get_llm_delegates_to_hybrid_get_chat_model() -> None:
    """Valida que get_llm() de Módulo 1 delegue a get_chat_model() con gemini-3.8-flash."""
    sentinel = object()
    with patch("src.core.llm_factory.get_chat_model", return_value=sentinel) as mock_chat:
        from src.core.llm_factory import get_llm

        res = get_llm(temperature=0.25)
        assert res is sentinel
        mock_chat.assert_called_once_with(temperature=0.25)
