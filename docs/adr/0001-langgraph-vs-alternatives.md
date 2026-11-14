# ADR-0001: Orquestación con LangGraph `StateGraph` frente a alternativas

- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Componentes:** `src/agent/graph.py`

## Contexto
Tecnoquímicas S.A. requiere pasar de cadenas LCEL estáticas (Módulo 1) a un agente multi-paso auditable con streaming paso a paso (`Thought -> Act -> Observe`), memoria durable ante reinicios y pausas Human-in-the-Loop (`HITL`) reales.

## Decisión
Adoptar **LangGraph `StateGraph`** complementado con el arnés LangChain v1 (`create_agent`, `ModelFallbackMiddleware`, `SummarizationMiddleware`, `HumanInTheLoopMiddleware`).

## Alternativas Evaluadas
- **LlamaIndex Workflows:** Orientado a pipelines ETL complejos de documentos, menos directo para pausas `interrupt()` + Time-Travel en checkpoints SQLite.
- **Agno / smolagents:** Mayor velocidad inicial o ejecución de código libre, pero menor trazabilidad determinista en entorno farmacéutico regulado.
- **DSPy:** Complementario para optimización futura de prompts con dataset gold, no sustituye un runtime transaccional con checkpoints.

## Consecuencias
- Flujo explícito `memory_sync -> gatekeeper_router -> (tool_executor | hitl_gate) -> synthesizer` con reanudación determinista vía `Command(resume=...)`.
