"""Contratos Pydantic v2 para el backend FastAPI del Agente Tecnoquímicas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Solicitud de mensaje conversacional hacia el agente LangGraph."""

    thread_id: str = Field(min_length=1, description="Identificador durable del hilo.")
    user_id: str = Field(default="default_user", description="Identificador de usuario para Store.")
    message: str = Field(min_length=1, description="Consulta o mensaje del usuario.")


class HITLDecisionRequest(BaseModel):
    """Resolución humana en vivo para reanudar una pausa HITL en el grafo."""

    thread_id: str = Field(min_length=1)
    user_id: str = Field(default="default_user")
    decision: Literal["approve", "edit", "reject"]
    edited_args: dict[str, Any] | None = Field(default=None)


class ForkThreadRequest(BaseModel):
    """Solicitud de bifurcación Time-Travel desde un checkpoint previo."""

    checkpoint_id: str | None = Field(default=None)
    new_thread_id: str | None = Field(default=None)


class InjectionTrapRequest(BaseModel):
    """Control para activar/desactivar documento trampa de prompt injection en Qdrant."""

    enabled: bool


class M1StreamRequest(BaseModel):
    """Solicitud de ejecución streaming LCEL para las cadenas del Módulo 1."""

    task: Literal["qa", "summary", "faq"]
    question: str = Field(default="", description="Pregunta de usuario cuando task='qa'.")


class HealthResponse(BaseModel):
    """Estado de salud del runtime agéntico y sus servicios persistentes."""

    status: str
    company: str
    llm_model: str
    ollama_available: bool
    langsmith_tracing: bool
    qdrant_stats: dict[str, Any]
    threads_count: int
