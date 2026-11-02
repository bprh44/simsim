@echo off
title Maritime AIS Simulator & Telemetry Cockpit
echo ======================================================================
echo Starting AIS Simulator & Telemetry Cockpit on http://127.0.0.1:8000
echo Pages available:
echo   - http://127.0.0.1:8000/viewer.html (Voyage Telemetry Cockpit)
echo   - http://127.0.0.1:8000/index.html  (Synthetic Route Simulator)
echo   - http://127.0.0.1:8000/ports.html  (Ports & H3 Spatial Visualizer)
echo   - http://127.0.0.1:8000/spatA/index.html (spatA Workbench)
echo ======================================================================
cd /d "%~dp0"
python -m uvicorn server:app --app-dir "%~dp0" --reload-dir "%~dp0" --host 127.0.0.1 --port 8000 --reload
pause
