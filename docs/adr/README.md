# Architecture Decision Records (ADRs) — Módulo 2 Tecnoquímicas S.A.

Registro de las 7 decisiones arquitectónicas clave que respaldan el diseño del Agente Conversacional Autónomo para **Grupo 7 · Tecnoquímicas S.A.** (Maestría en IA y Ciencias de Datos — UAO 2026-2S).

| ID | Decisión | Estado | Archivo |
| :--- | :--- | :---: | :--- |
| **ADR-0001** | Orquestación con LangGraph `StateGraph` frente a alternativas | Aceptada | [`0001-langgraph-vs-alternatives.md`](0001-langgraph-vs-alternatives.md) |
| **ADR-0002** | Motor RAG híbrido en Qdrant (`HNSW` + RRF Densa/Léxica) | Aceptada | [`0002-qdrant-hybrid-hnsw-rrf.md`](0002-qdrant-hybrid-hnsw-rrf.md) |
| **ADR-0003** | Memoria Dual persistente (`SqliteSaver` + `PersistentMemoryStore`) | Aceptada | [`0003-dual-memory-sqlite-store.md`](0003-dual-memory-sqlite-store.md) |
| **ADR-0004** | Enrutamiento Gatekeeper System One (Jev) sin búsquedas ociosas | Aceptada | [`0004-gatekeeper-jev-router.md`](0004-gatekeeper-jev-router.md) |
| **ADR-0005** | Blindaje del RAG contra Prompt Injection Indirecto | Aceptada | [`0005-rag-indirect-injection-shield.md`](0005-rag-indirect-injection-shield.md) |
| **ADR-0006** | Estrategia LLM híbrida (`gemini-3.8-flash` + fallback Ollama `llama3.2`) | Aceptada | [`0006-gemini-ollama-fallback.md`](0006-gemini-ollama-fallback.md) |
| **ADR-0007** | Desacoplamiento Frontend 3D React 19 + FastAPI SSE y apagado limpio | Aceptada | [`0007-frontend-3d-sse-architecture.md`](0007-frontend-3d-sse-architecture.md) |
