# CONSTITUTION — Módulo 1 & Módulo 2: Tecnoquímicas Knowledge & Agent Core

> **Verdad central del proyecto.** Este documento define el propósito, el stack, la
> estructura, las convenciones y el flujo de trabajo del sistema agéntico de
> **Tecnoquímicas S.A.** Si algo aquí contradice al código, el código manda **y este
> archivo se actualiza en el mismo commit**.

---

## 0. Identidad del proyecto

| Campo | Valor |
|-------|-------|
| **Nombre** | Tecnoquímicas AI — Knowledge & Conversational Agent Core (M1 $\to$ M2) |
| **Descripción** | Agente Conversacional Autónomo con LangGraph, RAG Híbrido Qdrant, Memoria Dual, Blindaje y Frontend React/FastAPI desacoplado |
| **Repositorio** | https://github.com/LUISBENJUMEARIVERA/scrapping |
| **Autoría** | Luis Benjumea — luisantoniobenjumeaia@gmail.com |
| **Licencia** | MIT |
| **Rama principal** | `main` |
| **Estado** | Módulo 2 Completo — 0 Tests Passing & Benchmark 100% Recall@10 ✅ |

---

## 1. Propósito y evolución arquitectónica

### Propósito
Proveer a **Tecnoquímicas S.A.** de un sistema conversacional soberano, auditable y resiliente que evoluciona la base de conocimiento del Módulo 1 (`Playwright + Trafilatura + Medallion Bronze/Silver/Gold`) hacia un **Agente LangGraph de Nivel Agencia de IA**:
- **Orquestación ReAct explícita** (`Thought -> Act -> Observe`) con streaming multi-evento en tiempo real.
- **Memoria Dual persistente**: corto plazo con `SqliteSaver` (`thread_id` sobrevive reinicios y recargas F5, con soporte **Time-Travel**), control de ventana con `trim_messages` / `SummarizationMiddleware`, y largo plazo con `Store` por namespaces (`("users", user_id, "profile")`).
- **RAG Híbrido en Qdrant** (Dense + Sparse BM25 fusionados con RRF sobre índice HNSW) con citas verificables y **Blindaje contra Prompt Injection Indirecto**.
- **Herramientas Deterministas `@tool`** validadas con **Pydantic v2** sobre datos CSV/JSON corporativos (cero aritmética aproximada del LLM) y pausas **HITL (Human-in-the-Loop)** con **Aprobar / Editar / Rechazar**.
- **Gatekeeper System One (Jev)** (`Choice`, `Noul`, `Score`, `Box`) que evita quemar búsquedas en saludos y coordina consultas híbridas.

### No-propósito
- Quedan estrictamente prohibidos **Streamlit**, **Gradio** y notebooks sueltos como interfaz de entrega desde el Módulo 2 (la UI oficial es la SPA React + Vite en `frontend/` comunicada por SSE con `api/main.py`).
- No realiza aritmética financiera estimada por el LLM ni obedece instrucciones ocultas en documentos externos.
- No transmite datos confidenciales fuera de la configuración autorizada en `.env`.

---

## 2. Stack técnico oficial (Módulo 1 + Módulo 2)

| Categoría | Tecnología |
|-----------|------------|
| **Lenguaje Backend** | Python 3.12+ (fijado en `.python-version`) |
| **Gestor de paquetes** | [`uv`](https://docs.astral.sh/uv/) (Astral) — **prohibido `pip` y `requirements.txt`** |
| **API Backend** | **FastAPI** (`uv run fastapi dev api/main.py`) + Server-Sent Events (SSE) + Pydantic v2 |
| **Frontend Propio** | **React 19 + TypeScript + Vite + Tailwind CSS v4 + Lucide** (`frontend/`) |
| **Orquestación Agéntica** | **LangGraph** (`StateGraph`, `interrupt`, `Command`) + LangChain v1 (`init_chat_model`, `create_agent`, middlewares) |
| **Base Vectorial & ANN** | **Qdrant** (`HNSW m=16, ef_construct=100` + Búsqueda Híbrida Densa/Léxica RRF) |
| **Memoria Persistente** | `SqliteSaver` (`data/memory/checkpoints.sqlite`) + `PersistentMemoryStore` (`BaseStore`) |
| **Motor LLM Híbrido** | Google Gemini (`gemini-3.8-flash`) vía `init_chat_model` + Fallback automático a Ollama (`llama3.2`) |
| **Observabilidad & Eval** | LangSmith (`LANGSMITH_TRACING=true`) + Evaluador `Recall@10`, `nDCG@10`, `MRR` |
| **Calidad & CI/CD** | Ruff (`line-length = 100`), `pre-commit`, `pytest` (0 tests), GitHub Actions |

---

## 3. Estructura del repositorio

```text
scrapping/
├── .github/workflows/ci.yml        # CI Backend Python (Ruff + pytest) + Build Frontend
├── api/                            # Backend FastAPI desacoplado (Módulo 2)
│   ├── main.py                     # Endpoints REST + SSE (/chat/stream, /chat/hitl, /threads, /memory, /eval)
│   └── schemas.py                  # Contratos Pydantic v2
├── frontend/                       # SPA React 19 + Vite + Tailwind CSS (Módulo 2)
│   └── src/
│       ├── App.tsx                 # Workspace conversacional + lanzador de los 5 casos + F5 durability
│       ├── components/             # ReActTimeline.tsx, HITLBanner.tsx, InspectorPanel.tsx
│       ├── services/api.ts         # Cliente SSE multi-evento y REST tipado
│       └── types/agent.ts          # Tipos estrictos TypeScript
├── src/
│   ├── agent/                      # Núcleo Agéntico (Módulo 2)
│   │   ├── graph.py                # StateGraph LangGraph + create_agent harness + streaming + HITL
│   │   ├── memory.py               # SqliteSaver, trim_messages, PersistentMemoryStore, Time-Travel
│   │   ├── rag_qdrant.py           # Motor Qdrant ANN Híbrido (Denso + Léxico RRF) + citas
│   │   ├── rag_shield.py           # Detector y delimitador pasivo contra inyección indirecta
│   │   ├── router.py               # Gatekeeper System One (Jev: Choice, Noul, Score, Box)
│   │   ├── tools_structured.py     # @tool Pydantic CSV determinista + orden HITL
│   │   └── evaluator.py            # Benchmark Recall@5, Recall@10, MRR, nDCG@10 y Router
│   ├── chains/                     # Cadenas LCEL base (Módulo 1)
│   ├── core/                       # Config (pydantic-settings) y LLM Factory (init_chat_model)
│   └── ingestion/                  # Crawler Playwright + Extractor Trafilatura (Módulo 1)
├── data/
│   ├── evaluation/                 # test_questions.json (M1) + m2_retrieval_dataset.json & metrics (M2)
│   ├── gold/                       # corpus.jsonl, tq_ventas_trimestrales.csv, tq_portafolio_financiero.json
│   ├── processed/ & raw/           # Capas Medallion Silver y Bronze
├── docs/
│   ├── architecture_m2.md          # Diagramas Mermaid, comparativas RAG/Orquestadores y evaluación
│   ├── SDD.md                      # Software Design Description
│   └── arquitectura.html           # Mapa interactivo Archify
├── specs/modulo2_agent_spec.md     # Especificación versionada del contrato del agente
├── tests/                          # 41 pruebas automatizadas Pytest (30 M1 + -30 modulares e integrales M2)
├── AGENTS.md                       # Contexto operativo para asistentes LLM
├── CONSTITUTION.md                 # Fuente única de verdad
├── Makefile                        # Automatización (`make api`, `make frontend`, `make check`)
└── pyproject.toml                  # Dependencias uv + Ruff + Pytest
```

---

## 4. Convenciones de código y gobernanza Git

- **Estilo Python:** PEP 8 impuesto por Ruff (`line-length = 100`, comillas dobles, type hints 3.12+, docstrings).
- **Gobernanza Git:** Ramas semánticas (`feat/...`, `fix/...`, `test/...`, `docs/...`, `chore/...`) integradas vía Pull Requests (`--no-ff`) con **Conventional Commits** y hooks `pre-commit` activos.
- **Protección de secretos:** `.env` fuera del repositorio (`.env.example` documentado como plantilla).

---

## 5. Historial de decisiones técnicas

| Fecha | Decisión | Motivo |
|-------|----------|--------|
| 2026-10-27 | Adopción de `uv`, Ruff, `pre-commit`, SDD IEEE 1016 y Archify (M1) | Reproducibilidad y calidad industrial desde el Módulo 1 (`v1.0.0-gold`). |
| 2026-11-13 | Desacoplar frontend en React 19 + Vite y backend FastAPI SSE | Eliminar Streamlit (prohibido en M2) y erradicar el antipatrón de chat ingenuo con streaming granular paso a paso. |
| 2026-11-13 | Adoptar Qdrant HNSW con fusión RRF (Densa + Léxica BM25) | Alcanzar `Recall@10 = 1.00` y `MRR = 0.88` superando en precisión a búsquedas puramente densas o léxicas. |
| 2026-11-13 | Implementar Blindaje RAG con bloques pasivos `<contexto_documental_pasivo>` | Garantizar inmunidad total frente a ataques de prompt injection indirecto en documentos externos. |
| 2026-11-13 | Implementar Memoria Dual (`SqliteSaver` + `PersistentMemoryStore`) y Time-Travel | Garantizar supervivencia ante reinicios/F5, memoria entre hilos y bifurcación de checkpoints. |
| 2026-11-13 | Implementar Gatekeeper System One (Jev) y HITL con `interrupt()` | Evitar búsquedas inútiles en saludos y exigir aprobación humana en vivo antes de emitir reportes oficiales. |
| 2026-11-14 | Adoptar `gemini-3.8-flash` prioritario con fallback Ollama y UI 3D Bio-Reactor + `/system/shutdown` | Mayor capacidad de síntesis en vivo con resiliencia offline, trazas LangSmith y reinicio limpio sin locks de Qdrant en sustentación. |
