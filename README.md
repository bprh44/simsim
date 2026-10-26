# AIS Synthetic Route Simulator & Telemetry Cockpit (simsim)

An interactive maritime simulation studio, replay viewer, and spatial analytics workbench for generating high-fidelity Class A synthetic AIS telemetry streams. Grounded in authentic DirectFerries corridors, commercial vessel profiles, and the authoritative NGA World Port Index.

Runs natively in modern browsers (**100% static on GitHub Pages**) and supports an optional local FastAPI backend.

---

## Key Features

1. **Canonical 10-Column Telemetry Output**:
   - Strictly outputs: `DateTime, LAT, LON, SOG, COG, Heading, Name, IMO, Type, Status`.
   - Excludes obsolete maritime registration IDs (MMSI, CallSign) and radio dimensions.
   - Standard RFC 4180 CSV export with instant browser download.

2. **Vessel Identity & Historical Picker**:
   - Random commercial vessel name generator with authentic 7-digit IMO (`IMO9xxxxxx`) with valid checksum.
   - **Previously Simulated Vessels dropdown**: Automatically populates from previous simulation runs to reuse vessel identity across multiple voyages.

3. **Dual Execution Mode (GitHub Pages + Local Server)**:
   - **GitHub Pages Mode**: 100% client-side simulation engine in JavaScript (`static/js/simulator_engine_client.js`). Synthesizes geodetic paths, Catmull-Rom splines, speed easing, and stochastic AIS pings directly in the browser. Persists runs to `localStorage`.
   - **Local FastAPI Mode**: High-performance Python backend (`server.py` + `simulator_engine.py`) with sub-millisecond port lookups and disk CSV writes.

4. **NGA World Port Index & H3 Spatial Grid Explorer**:
   - Grounded in `reference/wpi_nga_ports.csv` (3,800+ worldwide ports).
   - Dedicated spatial visualizer (`ports.html`) featuring 768 Asian ports on CARTO maps (Dark Matter, Positron, Voyager).
   - Interactive slider controlling Uber H3 spatial resolutions from **3 to 8** with density choropleth and inspection drawer.

5. **Historical Telemetry Viewer & Playback Inspector**:
   - Replay voyages on interactive Leaflet maps with heading triangles and SOG-colored breadcrumbs.
   - Drag-and-drop or upload custom AIS CSV files directly into the viewer for instant inspection.

---

## Canonical Telemetry Contract (10 Columns)

| Column | Type | Example | Description |
|---|---|---|---|
| `DateTime` | ISO 8601 UTC | `2026-10-27T01:15:00Z` | Timestamp of transmission |
| `LAT` | Float (6 dec) | `35.102800` | Latitude (-90.0 to 90.0) |
| `LON` | Float (6 dec) | `129.040300` | Longitude (-180.0 to 180.0) |
| `SOG` | Float (1 dec) | `16.5` | Speed Over Ground in knots |
| `COG` | Float (1 dec) | `142.3` | Course Over Ground in degrees [0, 360) |
| `Heading` | Integer | `142` | True heading in degrees [0, 359] |
| `Name` | String | `PACIFIC GLORY 12` | Commercial vessel name |
| `IMO` | String | `IMO9382104` | 7-digit IMO number (`IMO9xxxxxx`) |
| `Type` | Integer | `70` | AIS Vessel Type (e.g. 60: Passenger, 70: Cargo, 71: Container, 80: Tanker) |
| `Status` | Integer | `0` | Navigational Status (0: Under way, 1: At anchor, 5: Moored) |

---

## Deployment & Running

### Option 1: GitHub Pages (Instant)
1. Push this repository to GitHub.
2. In repository settings, navigate to **Pages** -> **Build and deployment**.
3. Select **Deploy from a branch** and choose `main` (root `/`).
4. Open the generated GitHub Pages URL:
   - `index.html`: Studio Cockpit (Draw routes, pick vessels, synthesize telemetry)
   - `viewer.html`: Replay Inspector (Inspect and scrub voyages, upload custom CSVs)
   - `ports.html`: Asian Ports & H3 Spatial Grid Explorer

### Option 2: Local Python / FastAPI Server
```bash
# Optional: run with Python 3.11 / 3.12 / 3.13
python server.py
```
Open `http://127.0.0.1:8765/` in your browser.

---

## Project Structure

```text
simsim/
├── .nojekyll                               # Disables Jekyll processing on GitHub Pages
├── index.html                              # Studio Cockpit (Draw & synthesize routes)
├── viewer.html                             # Historical Replay & Playback Inspector
├── ports.html                              # Asian Ports & H3 Spatial Grid Explorer
├── simulator_engine.py                     # Python trajectory generator (10-column schema)
├── server.py                               # FastAPI web application server
├── reference/
│   └── wpi_nga_ports.csv                   # Authoritative NGA World Port Index
├── static/
│   ├── css/
│   │   └── style.css                       # Modern maritime glassmorphic design system
│   └── js/
│       ├── simulator.js                    # Studio UI & map interactions
│       ├── simulator_engine_client.js      # Client-side trajectory engine (GitHub Pages)
│       ├── viewer.js                       # Viewer playback, HUD, & CSV parser
│       ├── corridors_data.js               # Preset maritime corridors
│       ├── vessel_specs_data.js            # Historical vessel dimensional specs
│       └── asia_ports.js                   # Asian ports dataset for H3 spatial grid
└── specs/
    └── 001-simplified-telemetry-and-vessel-picker/
        ├── spec.md                         # Feature specification
        ├── plan.md                         # Technical architecture plan
        └── tasks.md                        # Task breakdown & completion log
```
