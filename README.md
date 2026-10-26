# Maritime AIS Synthetic Route Simulator & Telemetry Cockpit

A high-fidelity maritime simulation workbench for drawing custom maritime voyages and generating realistic Class A AIS telemetry streams matching canonical NOAA / Bronze schemas.

---

## 1. Carto Mapping Framework Extraction
Extracted from `sim/Korean Baseball`:
* **Engine**: Leaflet.js (`L.map`, `L.tileLayer`)
* **Basemaps**: Dual-layer Carto Positron / Dark Matter / Voyager
* **API Key**: `cb1_3fzc_1_e47177e320e1c761d456a149`
* **Tile URLs**: `https://{s}.basemaps.cartocdn.com/rastertiles/{style}_nolabels/{z}/{x}/{y}.png?key=...` with `{style}_only_labels` overlay.

---

## 2. DuckDB Historical Data Grounding
Calibrated directly from `data/bronze/ais_bronze.duckdb` (43.9M records):
* **Vessel Specifications (`vessel_specs.json`)**: Empirical median Length, Width, Draft, and typical Cruising Speeds for 40 historical vessel categories (Cargo, Container, Tanker, Passenger/Ferry, High-Speed Craft, Tugs, Fishing, etc.).
* **Authentic Identifiers**:
  * **MMSI**: Valid 9-digit identifiers matching country MIDs (South Korea `440/441`, Japan `431/432`, Panama `351-357`, Liberia `636`, Singapore `563`, etc.).
  * **IMO**: 7-digit numbers with authentic formatting (`IMO9xxxxxx`).
  * **Vessel Name**: Realistic maritime commercial shipping prefixes & suffixes.
  * **Call Sign**: 4 to 6 character standard radio call signs.

---

## 3. Kinematics & Simulation Features
* **Drawing Modes (Option C)**:
  * **Click Nodes**: Click to add sequential waypoints, drag nodes to adjust, and undo/clear.
  * **Freehand Drag**: Hold mouse button and sketch continuous path across sea; automatically simplified via Ramer-Douglas-Peucker algorithm into clean waypoints.
* **Physics & Speed Curves (Option A)**:
  * **Turn Smoothing**: Catmull-Rom spline curves through waypoints calculating real-time Rate-of-Turn (ROT) in degrees/minute.
  * **Harbor Easing**: Automatic slow acceleration (~5-8 knots) out of departure ports and deceleration on arrival.
  * **1.5x Open-Sea Boost**: Toggle checkbox allowing vessels to accelerate up to 1.5× cruising speed in open waters.
  * **Heading & COG Realism**: Realistic leeway drift and heading lead during maneuvering.
* **Timing Modes**:
  * **Forward Mode**: Start at chosen/current time $\rightarrow$ computes forward telemetry timestamps.
  * **Reverse Mode**: Finish at chosen/current time $\rightarrow$ reverse computes voyage start time and timestamps.
* **Empirical Transmission Stochasticity**:
  * Normal AIS pings randomly jittered between 15s and 120s (faster ~10–25s on turns).
  * Dropped packet gaps allowed up to 600s (10 min) to simulate satellite/terrestrial shadow.

---

## 4. Web Interfaces
* **Interactive Studio**: `http://127.0.0.1:8765/`
* **Telemetry Run Viewer**: `http://127.0.0.1:8765/viewer`
  * Lists all saved simulation runs from `output/`.
  * Plots both the original drawn route (dashed line) and colored AIS pings (speed color-coded).
  * Timeline scrubber with animation playback (`▶️`) and hover inspector.
  * Direct CSV download for each run.

---

## 5. Verified Sample Routes
Pre-generated or generated into `output/`:
1. **Incheon (KR) $\rightarrow$ Fukuoka (JP)**:
   - File: `1_Incheon_to_Fukuoka_356316238.csv`
   - Vessel: `ROYAL NAVIGATOR 25` (Type 70 Cargo, MMSI `356316238`)
   - Distance: 438.8 NM | Pings: 940 | Avg Speed: 21.2 kts | Max Speed: 25.0 kts
2. **Tomakomai (Hokkaido) $\rightarrow$ Sendai (JP)**:
   - File: `2_Tomakomai_to_Sendai_563403252.csv`
   - Vessel: `DIAMOND LEADER 56` (Type 60 Passenger/Ferry, MMSI `563403252`)
   - Distance: 286.4 NM | Pings: 529 | Avg Speed: 24.7 kts | Max Speed: 29.5 kts
3. **Busan $\rightarrow$ Jeju Island (KR)**:
   - File: `3_Busan_to_Jeju_564795926.csv`
   - Vessel: `DIAMOND ARROW 8` (Type 60 Passenger Ferry, MMSI `564795926`)
   - Distance: 158.0 NM | Pings: 307 | Avg Speed: 22.2 kts | Max Speed: 27.3 kts
