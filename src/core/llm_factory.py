"""Fábrica unificada de modelos de lenguaje con LangChain v1 (`init_chat_model`), Gemini y Ollama."""

import logging
import os

import httpx
from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_ollama import ChatOllama
from src.core.config import config

logger = logging.getLogger(__name__)


def get_llm(temperature: float = 0.1) -> ChatOllama:
    """Instancia y retorna el modelo de Ollama con baja temperatura para evitar alucinaciones."""
    return ChatOllama(
        model=config.llm_model,
        base_url=config.ollama_base_url,
        temperature=temperature,
    )


def get_chat_model(
    model: str | None = None,
    provider: str | None = None,
    temperature: float = 0.1,
) -> BaseChatModel:
    """Instancia un modelo de chat agnóstico de proveedor mediante `init_chat_model`.

    Prioriza Google Gemini (`google_genai`) cuando existe clave válida configurada y aplica
    fallback automático hacia Ollama local (`llama3.2`) si Gemini no está disponible.
    """
    target_provider = provider or config.get_active_provider()
    if model is not None:
        target_model = model
    elif target_provider == "google_genai":
        target_model = config.gemini_model
    else:
        target_model = config.llm_model

    if target_provider == "google_genai":
        api_key = config.resolve_google_api_key()
        if api_key and not os.environ.get("GOOGLE_API_KEY"):
            os.environ["GOOGLE_API_KEY"] = api_key
        if api_key:
            try:
                return init_chat_model(
                    model=target_model,
                    model_provider="google_genai",
                    temperature=temperature,
                )
            except Exception as exc:  # pragma: no cover - fallback defensivo
                logger.warning(
                    "Fallo inicializando Gemini (%s); activando fallback a Ollama %s: %s",
                    target_model,
                    config.llm_model,
                    exc,
                )
        target_provider = "ollama"
        target_model = config.llm_model

    if target_provider == "ollama":
        return init_chat_model(
            model=target_model,
            model_provider="ollama",
            base_url=config.ollama_base_url,
            temperature=temperature,
        )

    return init_chat_model(
        model=target_model,
        model_provider=target_provider,
        temperature=temperature,
    )


def is_ollama_available(timeout_seconds: float = 1.5) -> bool:
    """Verifica de forma rápida si el servidor local de Ollama está activo y accesible."""
    try:
        resp = httpx.get(f"{config.ollama_base_url}/api/tags", timeout=timeout_seconds)
        return resp.status_code == 200
    except httpx.HTTPError:
        return False


def is_gemini_configured() -> bool:
    """Indica si existe una clave de Google AI Studio / Gemini lista para usarse."""
    return config.has_valid_google_key()


def is_llm_online(timeout_seconds: float = 1.5) -> bool:
    """Retorna True si Gemini cloud está configurado o si Ollama local está activo."""
    return is_gemini_configured() or is_ollama_available(timeout_seconds=timeout_seconds)
