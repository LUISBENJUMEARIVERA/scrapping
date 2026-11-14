"""Pruebas unitarias para configuración de secretos limpios y resiliencia LLM."""

from __future__ import annotations

from src.agent.graph import build_langchain_v1_harness, configure_langsmith_env
from src.agent.memory import DualMemoryManager
from src.core.config import TecnoquimicasConfig
from src.core.llm_factory import get_chat_model


def test_config_discards_placeholder_api_keys(monkeypatch) -> None:
    """Descarta valores vacíos o placeholders como PEGA_TU_API_KEY."""
    # Arrange
    monkeypatch.setenv("GOOGLE_API_KEY", "pega_tu_api_key_aqui")
    monkeypatch.setenv("LANGSMITH_API_KEY", "placeholder_secret")

    # Act
    cfg = TecnoquimicasConfig()

    # Assert
    assert cfg.resolve_google_api_key() is None
    assert cfg.resolve_langsmith_api_key() is None
    assert cfg.has_valid_google_key() is False


def test_config_prefers_google_genai_when_real_key_is_set(monkeypatch) -> None:
    """Detecta google_genai como proveedor activo cuando hay clave válida no vacía."""
    # Arrange
    monkeypatch.setenv("GOOGLE_API_KEY", "test-valid-key-format-only")

    # Act
    cfg = TecnoquimicasConfig()

    # Assert
    assert cfg.has_valid_google_key() is True
    assert cfg.get_active_provider() == "google_genai"
    assert cfg.get_active_model() == cfg.gemini_model


def test_get_chat_model_falls_back_to_ollama_when_no_google_key(monkeypatch) -> None:
    """Sin GOOGLE_API_KEY válida, get_chat_model instancia proveedor local Ollama."""
    # Arrange
    monkeypatch.setenv("GOOGLE_API_KEY", "")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    # Act
    llm = get_chat_model()

    # Assert
    assert "Ollama" in llm.__class__.__name__


def test_configure_langsmith_env_and_harness_middlewares(monkeypatch, tmp_path) -> None:
    """Valida inyección de variables LangSmith y construcción del arnés LangChain v1."""
    # Arrange
    monkeypatch.setenv("LANGSMITH_API_KEY", "ls-test-dummy-token")
    mem = DualMemoryManager(
        checkpoint_db_path=str(tmp_path / "harness.sqlite"),
        store_path=str(tmp_path / "harness_store.json"),
    )

    # Act
    active = configure_langsmith_env()
    harness = build_langchain_v1_harness(memory_mgr=mem)

    # Assert
    assert active is True
    assert harness is not None
    mem.conn.close()
