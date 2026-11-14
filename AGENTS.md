# AGENTS — Módulo 1: Knowledge Core

> Contexto del proyecto para sesiones con asistentes LLM (OpenCode, Antigravity,
> GitHub Copilot CLI, Claude Code, etc.). Trackeado al repositorio.

## Proyecto

Núcleo de Inteligencia y Extracción de Conocimiento de Tecnoquímicas S.A. con LCEL y Web Scraping

> 📘 La verdad técnica central —propósito, stack, estructura, convenciones, decisiones y
> flujo de trabajo— vive en [`CONSTITUTION.md`](./CONSTITUTION.md). **Léela antes de
> operar.** Ante cualquier cambio arquitectónico, tecnológico o de proceso, actualízala
> en el mismo commit.

---

## Flujo Diario (commit + push)

```bash
# 1. Ver cambios
git status

# 2. Verificación completa (lint + formato + pruebas)
make check

# 3. Agregar y commitear (los hooks de pre-commit se ejecutan solos)
git add -A
git commit -m "tipo: mensaje descriptivo"

# 4. Subir a GitHub
git push
```

**Convención de commits:** [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — nueva funcionalidad
- `fix:` — corrección de bug
- `docs:` — documentación
- `refactor:` — refactorización
- `style:` — formato, linting (sin cambio de lógica)
- `test:` — pruebas
- `chore:` — mantenimiento o configuración

---

## Comandos del proyecto (`make`)

```bash
make help      # lista los objetivos disponibles
make dev       # entornos + hooks de pre-commit
make check     # lint + formato + pruebas
make lint      # Ruff (lint)
make format    # Ruff (formato)
make test      # pytest (M1 + M2)
make api       # FastAPI backend (uv run fastapi dev api/main.py)
make frontend  # React + Vite SPA (cd frontend && npm run dev)
make eval-m2   # benchmark Recall@10, nDCG@10 y Router
```

> ⚠️ **Regla dura:** toda gestión de dependencias y entornos pasa por `uv`. Está
> **prohibido** `pip` y `requirements.txt`.

---

## Búsqueda de código: `tgrep`

Si [`tgrep`](https://github.com/microsoft/tgrep) está instalado, úsalo para búsquedas de
código en lugar de `grep` o `find` (índice de trigramas en `.tgrep/`, ignorado por Git):

```bash
tgrep -- "patrón" .            # búsqueda regex (usa -- antes del patrón)
tgrep -F -- "simbolo" .        # coincidencia literal
tgrep -t py -- "def " .        # filtrar por tipo de archivo
tgrep -g "src/**" -- "kw" .    # filtrar por ruta
tgrep -l -- "import torch" .   # listar archivos coincidentes
tgrep index .                  # (re)indexar
```

En OpenCode la preferencia se aplica automáticamente mediante la regla
[`.opencode/rules/tgrep.md`](./.opencode/rules/tgrep.md).

---

## Estructura y convenciones

- `src/agent/` — núcleo agéntico LangGraph (ReAct, memoria dual, Qdrant híbrido, blindaje, Gatekeeper Jev).
- `api/` — backend FastAPI desacoplado con streaming SSE multi-evento y HITL.
- `frontend/` — SPA React 19 + TypeScript + Vite + Tailwind CSS desacoplada.
- `src/modulo1_knowledge_core/` — código base del paquete (src-layout).
- `tests/` — pruebas con `pytest` (patrón AAA).
- `docs/` y `specs/` — documentación, diagramas, ADRs y especificación versionada.
- `CONSTITUTION.md` — fuente única de verdad.
- Estilo impuesto por **Ruff** (`line-length = 100`, comillas dobles).
- Idioma: UI, comentarios y commits en español; identificadores en inglés.
