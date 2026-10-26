@echo off
title AIS Synthetic Route Simulator Cockpit
cd /d "%~dp0"
echo Starting AIS Synthetic Route Simulator on http://127.0.0.1:8765 ...

if exist ".venv\Scripts\python.exe" (
    .venv\Scripts\python.exe server.py
) else if exist "..\.venv\Scripts\python.exe" (
    ..\.venv\Scripts\python.exe server.py
) else (
    python server.py
)
pause
