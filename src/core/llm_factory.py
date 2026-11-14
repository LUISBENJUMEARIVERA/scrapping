"""Fábrica unificada de modelos de lenguaje con LangChain v1 (`init_chat_model`) y Ollama."""

import httpx
from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_ollama import ChatOllama
from src.core.config import config


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
    """Instancia un modelo de chat agnóstico de proveedor mediante `init_chat_model`."""
    target_model = model or config.llm_model
    target_provider = provider or config.llm_provider

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
