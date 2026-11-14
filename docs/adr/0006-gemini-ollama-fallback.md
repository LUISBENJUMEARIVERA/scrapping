# ADR-0006: Estrategia LLM Híbrida (`gemini-3.8-flash` + Fallback Ollama `llama3.2`)

- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Componentes:** `src/core/config.py`, `src/core/llm_factory.py`, `src/agent/graph.py`

## Contexto
Para la sustentación y operación corporativa se requiere alta capacidad de síntesis en la nube cuando hay clave de Google AI Studio, manteniendo continuidad soberana offline ante fallos de cuota o red.

## Decisión
Centralizar la instanciación en `init_chat_model()` (`langchain.chat_models`) priorizando `gemini-3.8-flash` (`google_genai`) cuando `resolve_google_api_key()` retorna una clave válida, encadenado con `ModelFallbackMiddleware` y `.with_fallbacks([ollama_model])` hacia Ollama (`llama3.2`), más respaldo determinista auditable si ninguno está disponible.
