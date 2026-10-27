# spatA — AIS Spatiotemporal Analytics & Hotspot Workbench

An interactive maritime analytics dashboard and spatial clustering workbench for large AIS datasets. Grounded in the **Product Requirements & System Design Document (PRD/SDD)**, **Uber H3 Discrete Global Grid Systems (DGGS)**, and spherical **Haversine DBSCAN** density clustering.

Designed with an ECDIS-grade dark glassmorphic cockpit and CARTO basemaps (`Dark Matter`, `Positron`, `Voyager`).

---

## Key Capabilities

1. **Dual Ingestion**:
   - Direct POSIX file reading from JupyterHub user storage (`/home/jovyan/data/*.csv`).
   - Drag-and-drop web file uploader for local client datasets.
   - Built-in sample corridor loader (`data/busan_sample.csv`).

2. **Diurnal & Day-of-Week Slicing**:
   - Diurnal time-of-day dual-slider (e.g. `08:00` to `17:00` UTC) with Day Shift and Night Shift presets.
   - Day-of-Week toggle pills (`M`, `T`, `W`, `T`, `F`, `S`, `S`) for isolating weekday vs. weekend maritime congestion.

3. **Multi-Scale H3 DGGS Hexagonal Aggregation**:
   - Configurable H3 resolution from **Res 6** (~36 km²) down to **Res 10** (~0.015 km²).
   - Choropleth density metrics: Point Count (Traffic Density), Unique Vessels, and Average SOG.

4. **Accelerated Centroid DBSCAN Hotspots**:
   - Clusters active H3 cell centroids using the spherical Haversine distance metric in radian space to prevent $\mathcal{O}(N^2)$ raw ping memory/CPU stalls.
   - Computes minimum bounding **2D Convex Hulls** for each hotspot.
   - **Top-$N$ Hotspots Leaderboard** with one-click "✈ Fly To Hotspot" camera navigation.

---

## Project Structure

```text
spatA/
├── index.html               # Full-screen glassmorphic analytics workbench
├── server.py                # Standalone FastAPI server for JupyterHub / local hosting
├── requirements.txt         # Optional Python dependencies
├── PRD_SDD.md               # Product Requirements & System Design Document
├── data/
│   └── busan_sample.csv     # Sample commercial AIS corridor dataset
└── static/
    └── js/
        └── map_config.js    # CARTO basemap & API key framework
```

---

## How to Run

### Option 1: Instant Browser (100% Static)
Simply open `index.html` in any modern web browser:
```powershell
Start-Process "d:\Vibe\simsim\spatA\index.html"
```
Everything runs natively in the browser using client-side H3-JS and spatial Haversine DBSCAN algorithms.

### Option 2: JupyterHub / FastAPI Server
```bash
cd spatA
pip install -r requirements.txt
python server.py
```
Open `http://127.0.0.1:8899/` or access via Jupyter Server Proxy at `/user/<username>/proxy/8899/`.
