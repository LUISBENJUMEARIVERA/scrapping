#!/usr/bin/env bash
set -e

echo "===================================================================="
echo "  Tecnoquímicas AI - Agente Conversacional Autónomo (Módulo 2)"
echo "===================================================================="
echo ""

if ! command -v uv &> /dev/null; then
    echo "[INFO] uv no detectado. Instalando uv (Astral)..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source "$HOME/.local/bin/env" 2>/dev/null || true
fi

echo "[1/4] Sincronizando dependencias Python con uv..."
uv sync --quiet

echo "[2/4] Verificando modelo llama3.2 en Ollama..."
if command -v ollama &> /dev/null; then
    ollama pull llama3.2 > /dev/null 2>&1 || true
else
    echo "[ADVERTENCIA] Ollama no detectado. Se activará síntesis determinista segura."
fi

echo "[3/4] Instalando dependencias del Frontend React + Vite..."
(cd frontend && npm install --silent)

echo "[4/4] Iniciando Backend FastAPI (:8000) y Frontend React (:5173)..."
uv run fastapi dev api/main.py &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

(cd frontend && npm run dev)
