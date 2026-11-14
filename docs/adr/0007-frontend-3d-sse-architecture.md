# ADR-0007: Frontend 3D Desacoplado (`React 19 + SSE`) y Apagado Limpio de Puertos

- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Componentes:** `frontend/`, `api/main.py`, `scripts/run_agent.ps1`

## Contexto
La rúbrica prohíbe Streamlit/Gradio y exige mostrar la ejecución agéntica viva sin bloqueos, además de permitir reiniciar el servidor durante la prueba de memoria sin conflictos de puerto ni locks de Qdrant (`portalocker`).

## Decisión
- Frontend SPA en **React 19 + TypeScript + Tailwind CSS v4 + Vite** (`AgentReactor3D`, `ReActTimeline`, `HITLBanner`, `InspectorPanel`) consumiendo eventos SSE (`memory`, `router`, `thought`, `action`, `observation`, `interrupt`, `token`, `citations`, `done`).
- Lanzador dinámico `scripts/run_agent.ps1` que libera instancias previas antes de asignar puertos TCP libres, y endpoint `POST /api/v1/system/shutdown` que cierra SQLite/Qdrant y termina backend/frontend de manera ordenada.
