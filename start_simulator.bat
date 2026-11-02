@echo off
title Maritime AIS Simulator & Telemetry Cockpit
echo ======================================================================
echo Starting AIS Simulator & Telemetry Cockpit on http://127.0.0.1:8765
echo Pages available:
echo   - http://127.0.0.1:8765/viewer.html (Voyage Telemetry Cockpit)
echo   - http://127.0.0.1:8765/index.html  (Synthetic Route Simulator)
echo   - http://127.0.0.1:8765/ports.html  (Ports & H3 Spatial Visualizer)
echo   - http://127.0.0.1:8765/spatA/index.html (spatA Workbench)
echo ======================================================================
cd /d "%~dp0"

set "PY_EXE=python"
if exist "C:\Users\RTX4070\AppData\Local\Programs\Python\Python312\python.exe" (
    set "PY_EXE=C:\Users\RTX4070\AppData\Local\Programs\Python\Python312\python.exe"
)

"%PY_EXE%" -m uvicorn server:app --app-dir "%~dp0" --reload-dir "%~dp0" --host 127.0.0.1 --port 8765 --reload
pause
