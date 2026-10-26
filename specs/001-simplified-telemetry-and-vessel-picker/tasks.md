# Tasks: Simplified Telemetry Stream & Vessel Identity Picker

**Input**: Design documents from `specs/001-simplified-telemetry-and-vessel-picker/` (`spec.md`, `plan.md`)  
**Feature Branch**: `001-simplified-telemetry-and-vessel-picker`  
**Status**: Completed & Converged  

---

## Phase 1: Foundational Engine & Reference Verification

- [x] **T001**: Verify and remove legacy `numpy` import from `simulator_engine.py` to prevent Windows DLL failures under Python 3.13.
- [x] **T002**: Refactor `build_trajectory()`, moored pings generator, and `save_trajectory_to_csv()` in `simulator_engine.py` to emit strictly 10 columns: `DateTime, LAT, LON, SOG, COG, Heading, Name, IMO, Type, Status`.
- [x] **T003**: Ingest and place authoritative `reference/wpi_nga_ports.csv` into `reference/` and implement `load_wpi_ports()` in `simulator_engine.py`.
- [x] **T004**: Create Asian ports dataset and H3 spatial grid visualizer in `specs/001-simplified-telemetry-and-vessel-picker/ports_visualizer.html`.

---

## Phase 2: User Story 1 & 2 — Server Endpoints & History Scanner (Priority: P1 & P2)

- [x] **T005** `[US2]` Implement `GET /api/vessels/history` in `server.py`:
  - Scan `output/*.csv` (reading header + first data row) and companion `.meta.json` files.
  - Deduplicate unique combinations of `Name`, `IMO`, `Type`, `TypeLabel`.
  - Return sorted list of historical vessels with run counts and last simulated timestamps.
- [x] **T006** `[US2]` Update `GET /api/random_vessel` in `server.py`:
  - Generate authentic 7-digit IMO (`IMO9xxxxxx`).
  - Generate commercial vessel name from international naming prefix/suffix pools.
  - Return `{Name, IMO, Type, TypeLabel, Status: 0}`.
- [x] **T007** `[US5]` Expose `GET /api/ports` in `server.py`:
  - Route query params (`q`, `country`, `limit`) to `simulator_engine.load_wpi_ports()`.
  - Cache results in memory for sub-millisecond lookups.
- [x] **T008** `[US1]` Update `POST /api/simulate` in `server.py`:
  - Accept `Name`, `IMO`, `Type`, and `Status` from the client request payload.
  - Pass clean profile to `generate_multi_leg_simulation()`.
  - Verify generated CSV strictly complies with the 10-column contract.
- [x] **T009** `[US1]` Update `GET /api/runs/{filename}` in `server.py`:
  - Support reading both 10-column canonical runs and legacy 17-column runs seamlessly.
  - Map `BaseDateTime → DateTime`, `VesselName → Name`, and `VesselType → Type`.

---

## Phase 3: User Story 3 — Studio Cockpit UX Refresh (Priority: P3)

- [x] **T010** `[US3]` Update `index.html` sidebar:
  - Replaced MMSI, CallSign, Length, Width, Draft, Cargo class inputs with:
    - `<select id="vessel-history-select">` ("Previously Simulated Vessels")
    - `<input id="vessel-name">`
    - `<input id="vessel-imo">`
    - `<button id="btn-random-vessel">🎲 Randomize Name & IMO</button>`
    - `<select id="vessel-type-select">`
    - `<select id="nav-status-select">`
- [x] **T011** `[US3]` Update `index.html` live telemetry table:
  - Table headers updated to strictly 10 columns: `DateTime | LAT | LON | SOG | COG | Heading | Name | IMO | Type | Status`.
- [x] **T012** `[US3]` Update `static/js/simulator.js`:
  - On page load, fetch `/api/vessels/history` and populate the vessel dropdown.
  - When a historical vessel is selected, automatically fill Name, IMO, and Type.
  - Wire "Randomize Identity" button to `/api/random_vessel`.
  - Update simulation payload builder to send `Name`, `IMO`, `Type`, `Status`.
  - Render preview table with the 10 canonical columns.

---

## Phase 4: User Story 4 — Historical Replay Viewer Refresh (Priority: P4)

- [x] **T013** `[US4]` Update `viewer.html`:
  - Replace MMSI column with `IMO` in the runs table.
  - Added link to Ports & H3 Grid in the top navigation.
  - Update telemetry inspector cards and HUD to display the 10 canonical fields.
- [x] **T014** `[US4]` Update `static/js/viewer.js`:
  - Parse `Name`, `IMO`, `Type`, `Status` in runs catalog.
  - Update map tooltip / inspector overlay to display the 10 canonical fields.
  - Maintain backward compatibility for older runs in `output/`.

---

## Phase 5: Verification & Quality Gates

- [x] **T015**: Run an end-to-end simulation via `server.py`.
  - Inspected output CSV file in `output/` confirming strictly 10 columns without extra headers.
  - Verified `/api/vessels/history` immediately reflects the new vessel.
- [x] **T016**: Verified `ports_visualizer.html` standalone page, H3 slider (3-8), CARTO basemap tiles, and Asian ports density bins.
