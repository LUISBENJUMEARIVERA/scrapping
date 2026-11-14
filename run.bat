@echo off
setlocal
echo ====================================================================
echo   Tecnoquimicas AI - Agente Conversacional Autonomo (Modulo 2)
echo ====================================================================
echo.

where uv >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] uv no detectado. Instalando uv (Astral)...
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)

echo [1/4] Sincronizando dependencias Python con uv...
call uv sync --quiet

echo [2/4] Verificando modelo llama3.2 en Ollama...
where ollama >nul 2>&1
if %ERRORLEVEL% equ 0 (
    ollama pull llama3.2 >nul 2>&1
) else (
    echo [ADVERTENCIA] Ollama no detectado en PATH. Modo fallback determinista disponible.
)

echo [3/4] Instalando dependencias del Frontend React + Vite...
cd frontend
call npm install --silent
cd ..

echo [4/4] Iniciando Backend FastAPI (puerto 8000) y Frontend Vite (puerto 5173)...
start "TQ FastAPI Backend" cmd /k "uv run fastapi dev api/main.py"
cd frontend
call npm run dev
