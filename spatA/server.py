"""
spatA — AIS Spatiotemporal Analytics Workbench Server
Dedicated FastAPI server with DuckDB integration for JupyterHub & standalone environments.
"""

import os
import sys
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.path.join(BASE_DIR, "data")

app = FastAPI(
    title="spatA — AIS Spatiotemporal Analytics Workbench",
    description="High-performance spatial clustering and diurnal temporal analytics on AIS datasets.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Static Assets and Data folders
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if os.path.exists(DATA_DIR):
    app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")


@app.get("/")
def serve_index():
    index_path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse(status_code=404, content={"message": "spatA index.html not found."})


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "spatA", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("SPATA_PORT", 8899))
    print(f"Starting spatA Workbench on http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
