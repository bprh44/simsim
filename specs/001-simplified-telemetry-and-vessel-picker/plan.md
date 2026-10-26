# Implementation Plan: Simplified Telemetry Stream & Vessel Identity Picker

**Branch**: `001-simplified-telemetry-and-vessel-picker` | **Date**: 2026-10-27 | **Spec**: [specs/001-simplified-telemetry-and-vessel-picker/spec.md](file:///d:/Vibe/simsim/specs/001-simplified-telemetry-and-vessel-picker/spec.md)

**Input**: Feature specification from `specs/001-simplified-telemetry-and-vessel-picker/spec.md`

---

## 1. Summary

Transition the synthetic AIS route simulation engine and web cockpit from legacy maritime registration schemas (containing MMSI, CallSign, Length, Width, Draft, Cargo class, ROT) to a strict, lightweight, 10-column canonical telemetry contract: `DateTime, LAT, LON, SOG, COG, Heading, Name, IMO, Type, Status`.

Integrate authentic IMO (`IMO9xxxxxx`) and commercial vessel name generation, accompanied by a dynamic historical vessel picker that scans previous runs from the `output/` directory. Ground all corridor waypoints and geographic lookups in the official NGA World Port Index (`reference/wpi_nga_ports.csv`), providing spatial verification and H3 hexagonal binning visualizers.

---

## 2. Technical Context

* **Language/Runtime**: Python 3.12 / 3.13 (pure standard library: `csv`, `json`, `math`, `datetime`, `pathlib`, `glob`, `re`, `random`, `uuid`).
* **Web Server**: FastAPI + Uvicorn serving static HTML/JS/CSS assets and REST endpoints (`server.py`).
* **Frontend**: Vanilla JavaScript (ES6+), Leaflet 1.9.4, CARTO raster tiles (Dark Matter, Positron, Voyager), Uber H3 JS v4.
* **Storage**: File-based CSV runs in `output/ais_{Name}_{IMO}_{timestamp}.csv` accompanied by lightweight JSON metadata (`.meta.json`).
* **Authoritative Reference Data**: `reference/wpi_nga_ports.csv` (3,800+ worldwide ports with NGA WPI indices, coordinates, water bodies).
* **Constraints**:
  - No LaTeX anywhere in markdown or documentation. Standard Unicode arrows (`→`) only.
  - Zero external Python package requirements for trajectory math (eliminated legacy numpy dependency).
  - Fast response times: `< 250ms` for historical scans, `< 50ms` for cached WPI lookups.

---

## 3. Architecture & Data Contracts

### 3.1 Canonical Telemetry Contract (10 Columns)
```csv
DateTime,LAT,LON,SOG,COG,Heading,Name,IMO,Type,Status
2026-10-27T01:15:00Z,35.102800,129.040300,16.5,142.3,142.0,PACIFIC GLORY 12,IMO9382104,70,0
```

### 3.2 Endpoint Architecture (`server.py`)
1. `GET /api/vessels/history`:
   - Scans `output/*.csv` and `output/*.meta.json`.
   - Extracts unique tuples of `(Name, IMO, Type, TypeLabel)` with run counts and last simulated date.
   - Response: `{"vessels": [{"Name": "...", "IMO": "...", "Type": 70, "TypeLabel": "70 - Cargo Ship", "last_run": "..."}]}`
2. `GET /api/random_vessel`:
   - Generates realistic commercial vessel profile with valid `IMO9xxxxxx` and `Name`.
   - Response: `{"Name": "...", "IMO": "...", "Type": 70, "TypeLabel": "...", "Status": 0}`
3. `GET /api/ports`:
   - Queries `simulator_engine.load_wpi_ports(query, country, limit)` with in-memory caching.
   - Response: `{"total": 768, "ports": [...]}`
4. `POST /api/simulate`:
   - Receives simulation payload containing `Name`, `IMO`, `Type`, `Status`.
   - Invokes `simulator_engine.generate_multi_leg_simulation()` emitting strictly the 10 columns.
5. `GET /api/runs/{filename}`:
   - Reads CSV rows. Automatically standardizes legacy headers (`BaseDateTime → DateTime`, `VesselName → Name`, `VesselType → Type`).

---

## 4. Source Code Structure & Target Changes

```text
d:\Vibe\simsim\
├── reference\
│   └── wpi_nga_ports.csv                                # Authoritative NGA WPI dataset
├── simulator_engine.py                                  # Core trajectory generator (Completed: 10 columns + ports)
├── server.py                                            # FastAPI server (To Update: endpoints + parsers)
├── index.html                                           # Studio Cockpit (To Update: sidebar + preview table)
├── viewer.html                                          # Historical Replay (To Update: runs list + HUD)
├── static\
│   ├── css\style.css                                    # Cockpit styling
│   └── js\
│       ├── simulator.js                                 # Studio interaction & telemetry generator
│       └── viewer.js                                    # Viewer timeline, scrubber, HUD
└── specs\001-simplified-telemetry-and-vessel-picker\
    ├── spec.md                                          # Feature specification
    ├── plan.md                                          # This implementation plan
    ├── tasks.md                                         # Ordered task list
    ├── asia_ports.json                                  # Extracted Asian ports data
    ├── asia_ports.js                                    # Standalone data container
    └── ports_visualizer.html                            # Interactive H3 & CARTO port visualizer
```

---

## 5. Risk Assessment & Mitigations

* **Risk 1: Legacy Output Compatibility**: Existing CSV files generated prior to this update have 17 columns (`BaseDateTime`, `MMSI`, `Length`, etc.).
  * *Mitigation*: The reader in `server.py` and `viewer.js` checks column names dynamically; if `BaseDateTime` is present, it maps to `DateTime`, if `VesselName` is present, it maps to `Name`. Missing `IMO` defaults cleanly to `-`.
* **Risk 2: Performance on Large `output/` Directories**:
  * *Mitigation*: The `/api/vessels/history` scanner reads only the header and first row of CSV files (or parses `.meta.json` companion files) rather than reading whole datasets into memory.
