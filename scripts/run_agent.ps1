<#
.SYNOPSIS
    Lanzador inteligente para Tecnoquímicas AI Agent (FastAPI + React/Vite).
    Detecta automáticamente puertos TCP libres para Backend y Frontend, arranca ambos
    servicios coordinados y abre la aplicación en el navegador predeterminado.
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [int]$PreferredBackendPort = 8000,
    [int]$PreferredFrontendPort = 5173
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

function Get-FreeTcpPort {
    param(
        [Parameter(Mandatory = $true)]
        [int]$StartPort,
        [int[]]$ExcludePorts = @()
    )

    $activePorts = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
        ForEach-Object { $_.Port }

    for ($port = $StartPort; $port -lt ($StartPort + 500); $port++) {
        if ($ExcludePorts -contains $port) {
            continue
        }
        if ($activePorts -contains $port) {
            continue
        }

        $listener = $null
        try {
            $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
            $listener.Start()
            return $port
        }
        catch {
            continue
        }
        finally {
            if ($null -ne $listener) {
                try { $listener.Stop() } catch {}
            }
        }
    }

    throw "No se encontró ningún puerto TCP libre a partir del puerto $StartPort."
}

$BackendPort = Get-FreeTcpPort -StartPort $PreferredBackendPort
$FrontendPort = Get-FreeTcpPort -StartPort $PreferredFrontendPort -ExcludePorts @($BackendPort)
$ApiUrl = "http://127.0.0.1:$BackendPort"
$UiUrl = "http://127.0.0.1:$FrontendPort"

function Stop-PreviousAgentInstances {
    $currentPid = $PID
    $pidsToStop = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object {
            ($_.LocalPort -ge 8000 -and $_.LocalPort -le 8010) -or
            ($_.LocalPort -ge 5173 -and $_.LocalPort -le 5185)
        } |
        Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($procId in $pidsToStop) {
        if ($procId -gt 0 -and $procId -ne $currentPid) {
            & taskkill.exe /PID $procId /T /F 2>$null | Out-Null
        }
    }
    if ($pidsToStop) {
        Start-Sleep -Milliseconds 250
    }
}

if ($DryRun) {
    Write-Output "BACKEND_PORT=$BackendPort"
    Write-Output "FRONTEND_PORT=$FrontendPort"
    Write-Output "VITE_API_URL=$ApiUrl"
    exit 0
}

Stop-PreviousAgentInstances

# Asegurar uv en PATH incluso al lanzar desde acceso directo de Windows
$LocalBin = Join-Path $env:USERPROFILE ".local\bin"
if ((Test-Path $LocalBin) -and -not ($env:PATH -split ";" | Where-Object { $_ -eq $LocalBin })) {
    $env:PATH = "$LocalBin;$env:PATH"
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] No se encontró 'uv' en el sistema. Instálalo desde https://docs.astral.sh/uv/" -ForegroundColor Red
    exit 1
}

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  Tecnoquimicas S.A. - AI Agent Runtime (Puerto Libre Automatico)   " -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "[1/4] Puertos libres asignados -> Backend: $BackendPort | Frontend: $FrontendPort" -ForegroundColor Green

$FrontendDir = Join-Path $RepoRoot "frontend"
$NodeModulesDir = Join-Path $FrontendDir "node_modules"
if (-not (Test-Path $NodeModulesDir)) {
    Write-Host "[2/4] Instalando dependencias del frontend (primera ejecucion)..." -ForegroundColor Yellow
    Push-Location $FrontendDir
    try {
        & npm.cmd install --silent
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "[2/4] Dependencias del frontend verificadas." -ForegroundColor Gray
}

$env:TQ_BACKEND_PORT = "$BackendPort"
$env:TQ_FRONTEND_PORT = "$FrontendPort"
$env:TQ_LAUNCHER_PID = "$PID"

Write-Host "[3/4] Iniciando Backend FastAPI en $ApiUrl ..." -ForegroundColor Cyan
$BackendProcess = Start-Process -FilePath "uv" `
    -ArgumentList @("run", "fastapi", "run", "api/main.py", "--host", "127.0.0.1", "--port", "$BackendPort") `
    -WorkingDirectory $RepoRoot `
    -PassThru `
    -NoNewWindow

try {
    $HealthUrl = "$ApiUrl/api/v1/health"
    $BackendReady = $false
    $MaxAttempts = 90

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        if ($BackendProcess.HasExited) {
            throw "El proceso de FastAPI terminó inesperadamente (código $($BackendProcess.ExitCode))."
        }
        try {
            $health = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 2
            if ($health.status -eq "ok") {
                $BackendReady = $true
                Write-Host "      Backend listo -> Modelo: $($health.llm_model) | LangSmith: $($health.langsmith_tracing) | Qdrant: $($health.qdrant_stats.points_count) puntos" -ForegroundColor Green
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }

    if (-not $BackendReady) {
        throw "El backend FastAPI en $HealthUrl no respondió a tiempo tras 45 segundos."
    }

    $env:VITE_API_URL = $ApiUrl
    $env:VITE_PORT = "$FrontendPort"

    Write-Host "[4/4] Iniciando Frontend React + Vite en $UiUrl ..." -ForegroundColor Cyan
    Write-Host "      Presiona Ctrl+C para detener tanto Frontend como Backend." -ForegroundColor Yellow
    Push-Location $FrontendDir
    try {
        & npm.cmd run dev -- --host 127.0.0.1 --port "$FrontendPort" --open
    }
    finally {
        Pop-Location
    }
}
finally {
    if ($null -ne $BackendProcess -and -not $BackendProcess.HasExited) {
        Write-Host "`nDeteniendo Backend FastAPI (PID $($BackendProcess.Id))..." -ForegroundColor Yellow
        & taskkill.exe /PID $BackendProcess.Id /T /F 2>$null | Out-Null
    }
}
