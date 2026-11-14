# Checklist Técnico Pre-Sustentación (Antes de las 8:00 a.m.)

- **Turno:** 10 (`10:15 – 10:30 a.m.`) | **Grupo:** 7 (`Tecnoquímicas`) | **Reviewer:** Luis Antonio Benjumea Rivera

## Verificaciones Obligatorias
- [ ] `git status` limpio en rama `main` sincronizada con `origin/main`.
- [ ] Pestaña **Pull Requests -> Closed** en GitHub con `>= 40` PRs fusionados y comentarios de revisión.
- [ ] `.env` local válido con `GOOGLE_API_KEY` (`gemini-3.8-flash`) y `LANGSMITH_API_KEY` (`tecnoquimicas-modulo2-agent`), nunca versionado en Git.
- [ ] `uv run pre-commit run --all-files` en verde (`Passed`).
- [ ] `uv run pytest -v` en verde (`100% passing`).
- [ ] `cd frontend && npm run build` sin errores TypeScript ni Vite.
- [ ] Acceso directo **`Tecnoquimicas AI Agent`** probado (arranque + consulta + botón **`Apagar sistema`**).

## Mapa de Salto Rápido en IDE (`10:00 – 11:30`)
1. **Separación Frontend / Backend:** carpetas `frontend/src/` vs `api/` y `src/agent/`.
2. **Componente Clave:** `src/agent/router.py` (`route_query_system_one` con `RouterDecision`: `Choice, Noul, Score, Box`) o `frontend/src/components/AgentReactor3D.tsx`.
3. **Endpoint de la API:** `POST /api/v1/chat/stream` y `POST /api/v1/system/shutdown` en `api/main.py`.
4. **Decisión Explicada Sin Leer:** `ADR-0002` (Fusión RRF Densa+BM25 en Qdrant `HNSW` para elevar `Recall@10` a `1.00` en siglas farmacéuticas como `BPM`/`INVIMA`).
