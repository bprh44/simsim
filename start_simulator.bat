@echo off
title AIS Synthetic Route Simulator Cockpit
cd /d "%~dp0\..\.."
echo Starting AIS Synthetic Route Simulator on http://127.0.0.1:8765 ...
.venv\Scripts\python.exe sim\ais_simulator\server.py
pause
