# Feature Specification: Simplified Telemetry Stream & Vessel Identity Picker

**Feature Directory**: `specs/001-simplified-telemetry-and-vessel-picker`  
**Created**: 2026-10-27  
**Status**: Specified / Ready for Planning  
**Input**: User description:
> "the telemetry streams will only have these columns: DateTime, LAT, LON, SOG, COG, Heading, Name, IMO, Type, Status. We can ignore the MMSI and maritime IDs allow the user to randomly generate the Name or IMO, but also have a dropdown of the other previously generated ones in the output folder available as a dropdown. incorporate the D:\Vibe\ohD\data\reference\ports\wpi_nga_ports.csv ports instead. copy it into the reference folder. adjust the UX for the updated columns we are producing."

---

## 1. User Scenarios & Prioritized User Stories *(mandatory)*

### User Story 1 - Canonical 10-Column Telemetry Output (Priority: P1)
As a maritime data consumer and simulation user, I want the generated AIS telemetry streams to contain strictly ten canonical columns (`DateTime`, `LAT`, `LON`, `SOG`, `COG`, `Heading`, `Name`, `IMO`, `Type`, `Status`) so that the dataset is lightweight, clean, and stripped of unnecessary maritime registration IDs and radio dimensions.

* **Why this priority**: Core data contract. Every downstream tool, CSV export, API endpoint, and UI component depends on this schema.
* **Independent Test**: Run a simulation along any two waypoints; verify that the resulting CSV file has exactly the header `DateTime,LAT,LON,SOG,COG,Heading,Name,IMO,Type,Status` and each row contains valid formatted values without MMSI, CallSign, Length, Width, Draft, Cargo, or ROT.
* **Acceptance Scenarios**:
  1. **Given** a trajectory generation request, **When** the simulation runs and saves to CSV, **Then** the CSV file header strictly contains `DateTime,LAT,LON,SOG,COG,Heading,Name,IMO,Type,Status`.
  2. **Given** moored port dwell periods in multi-leg runs, **When** moored pings are logged, **Then** moored pings use the exact same 10-column schema with `Status` set to 5 and `SOG` near 0.

---

### User Story 2 - Vessel Identity Generation & Historical Picker (Priority: P2)
As a simulation operator in the Studio Cockpit, I want to either randomly generate a vessel's `Name` and authentic `IMO`, type custom values, or select a previously simulated vessel from a dropdown populated from the `output/` folder so that I can maintain consistent identity across multiple voyage runs without tedious manual re-entry.

* **Why this priority**: Direct workflow efficiency. Allows instant reuse of established vessels while removing MMSI/CallSign clutter.
* **Independent Test**: Place two previously generated CSV runs in `output/`; load the studio page; verify the "Previously Simulated Vessels" dropdown displays both unique vessels and selecting one populates the `Name`, `IMO`, and `Type` fields. Verify clicking "Randomize Identity" generates a new realistic name and valid IMO.
* **Acceptance Scenarios**:
  1. **Given** saved simulation runs in `output/`, **When** the user opens the Studio Cockpit (`/`), **Then** a dropdown displays all unique vessels extracted from previous runs.
  2. **Given** a selected vessel in the historical dropdown, **When** the user clicks it, **Then** the form's `Name`, `IMO`, and `Type` fields auto-fill instantly.
  3. **Given** the user wants a new vessel, **When** they click "🎲 Randomize Name & IMO", **Then** the engine generates a valid 7-digit IMO (`IMO9xxxxxx`) and a realistic commercial name from the naming pool.

---

### User Story 3 - Studio Cockpit & Live Telemetry UX Refresh (Priority: P3)
As an interactive studio user on `/`, I want the Vessel Specifications sidebar and the Live Telemetry preview table to focus exclusively on the 10 active fields, eliminating obsolete inputs (MMSI, CallSign, Length, Width, Draft, Cargo class).

* **Why this priority**: High UX quality and clarity. Eliminates confusion caused by deprecated inputs.
* **Independent Test**: Open `http://127.0.0.1:8765/`; verify the sidebar only presents Name, IMO, Type, Navigation Status, and Historical Vessel Picker; verify the preview table headers match `DateTime, LAT, LON, SOG, COG, Heading, Name, IMO, Type, Status`.
* **Acceptance Scenarios**:
  1. **Given** the studio sidebar, **When** inspecting the vessel configuration card, **Then** only `Name`, `IMO`, `Type`, `Status`, and the historical vessel dropdown are shown.
  2. **Given** a completed simulation, **When** viewing the telemetry preview table, **Then** the 10 columns are rendered with readable formatting (e.g. coordinates to 4 decimal places, SOG in knots with 1 decimal).

---

### User Story 4 - Historical Telemetry Viewer UX Refresh (Priority: P4)
As a simulation auditor on `/viewer`, I want the historical runs table, the hover inspector HUD, and the timeline playback scrubber to display `Name`, `IMO`, and `Type` without MMSI columns.

* **Why this priority**: Consistency between creation and analysis surfaces.
* **Independent Test**: Navigate to `http://127.0.0.1:8765/viewer`; verify the runs table displays `Vessel Name`, `IMO`, `Type`, `Pings`, `Distance`, `Start Time`, `End Time`, and `Actions` (with no MMSI column).
* **Acceptance Scenarios**:
  1. **Given** previous runs, **When** viewing `/viewer`, **Then** the runs list displays `Name`, `IMO`, and `Type` cleanly.
  2. **Given** an active replay on the viewer map, **When** hovering over a ping or scrubbing the timeline, **Then** the HUD displays `DateTime`, `LAT, LON`, `SOG`, `COG`, `Heading`, `Name`, `IMO`, `Type`, and `Status`.

---

### User Story 5 - Authoritative NGA World Port Index Integration (Priority: P5)
As a voyage planner, I want the corridor and waypoint system to reference ports from the authoritative `reference/wpi_nga_ports.csv` database so that departure, arrival, and fairway waypoints are grounded in official NGA maritime port data.

* **Why this priority**: Enhances realism and geographic accuracy across all maritime corridor presets.
* **Independent Test**: Verify `reference/wpi_nga_ports.csv` is present in the repository and an API endpoint `/api/ports` allows searching ports by name or country.
* **Acceptance Scenarios**:
  1. **Given** `reference/wpi_nga_ports.csv`, **When** the server starts, **Then** the port catalog is accessible for lookup.
  2. **Given** preset corridors, **When** inspecting corridor endpoints, **Then** they reference verified NGA port names and positions.

---

## 2. Requirements & Constraints *(mandatory)*

### Functional Requirements
* **FR-001**: `simulator_engine.py` MUST generate telemetry ping dictionaries with the exact keys: `DateTime`, `LAT`, `LON`, `SOG`, `COG`, `Heading`, `Name`, `IMO`, `Type`, `Status`.
* **FR-002**: `save_trajectory_to_csv()` MUST write CSV files with the exact header line: `DateTime,LAT,LON,SOG,COG,Heading,Name,IMO,Type,Status`.
* **FR-003**: The engine MUST NOT emit `MMSI`, `CallSign`, `Length`, `Width`, `Draft`, `Cargo`, `TransceiverClass`, or `ROT` into the CSV file.
* **FR-004**: `server.py` MUST expose an endpoint `GET /api/vessels/history` that parses all CSV and `.meta.json` files in the `output/` directory and returns a deduplicated list of unique vessels (`Name`, `IMO`, `Type`, `TypeLabel`).
* **FR-005**: `server.py` MUST update `GET /api/random_vessel` to return an authentic `Name`, formatted `IMO` (`IMO9xxxxxx`), `Type`, `TypeLabel`, and default `Status` (0: Under way).
* **FR-006**: `server.py` MUST expose `GET /api/ports` to allow searching and querying ports from `reference/wpi_nga_ports.csv` with pagination and keyword filtering.
* **FR-007**: `index.html` and `simulator.js` MUST provide a "Previously Simulated Vessels" dropdown that automatically populates `Name`, `IMO`, and `Type` when selected.
* **FR-008**: `index.html` MUST provide a "🎲 Randomize Name & IMO" button that requests/generates a fresh vessel profile.
* **FR-009**: `index.html` MUST display the 10 updated columns in the telemetry preview table.
* **FR-010**: `viewer.html` and `viewer.js` MUST update the runs table and playback inspector HUD to display `Name`, `IMO`, and `Type`, removing all MMSI references.
* **FR-011**: Both studio and viewer MUST remain backwards-compatible when reading existing runs that contain legacy column names (`BaseDateTime`, `VesselName`, `VesselType`).

### Non-Functional Requirements & Performance
* **NFR-001**: Historical vessel scanning (`GET /api/vessels/history`) MUST execute in < 250ms for up to 1,000 files in `output/` by reading headers and companion `.meta.json` files.
* **NFR-002**: Port lookup (`GET /api/ports`) MUST lazily cache parsed WPI records in memory so search queries return in < 50ms.
* **NFR-003**: Zero external dependencies: rely strictly on standard Python libraries (`csv`, `json`, `math`, `os`, `glob`) and FastAPI.

---

## 3. Data Models & Schemas

### 10-Column CSV Schema
```csv
DateTime,LAT,LON,SOG,COG,Heading,Name,IMO,Type,Status
2026-10-27T01:15:00Z,35.102800,129.040300,16.5,142.3,142.0,PACIFIC GLORY 12,IMO9382104,70,0
```

### Vessel Profile Object (JSON)
```json
{
  "Name": "PACIFIC GLORY 12",
  "IMO": "IMO9382104",
  "Type": 70,
  "TypeLabel": "70 - Cargo Ship (General / Bulk)",
  "Status": 0,
  "TypicalCruiseSpeed": 16.6
}
```

---

## 4. Edge Cases & Handling
1. **Empty Output Directory**:
   * If `output/` has no previous runs, the "Previously Simulated Vessels" dropdown gracefully displays `-- No Previous Runs Found --` and remains disabled without throwing errors.
2. **Missing IMO in Legacy Runs**:
   * If an older CSV in `output/` lacks an IMO, the parser provides an auto-generated or empty fallback (`-`).
3. **Legacy CSV Reading in Viewer**:
   * When loading a run produced with the legacy schema, `server.py` maps `BaseDateTime → DateTime`, `VesselName → Name`, and `VesselType → Type`.
4. **Special Characters in Vessel Names**:
   * Vessel names containing commas or quotes are properly escaped according to standard RFC 4180 CSV specifications.
