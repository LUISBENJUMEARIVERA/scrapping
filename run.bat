@echo off
setlocal
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0scripts\run_agent.ps1" %*
