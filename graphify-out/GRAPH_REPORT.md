# Graph Report - simsim  (2026-11-03)

## Corpus Check
- Large corpus: 57 files · ~1,183,527 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 258 nodes · 414 edges · 18 communities (9 shown, 9 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.86)
- Token cost: 12,500 input · 3,200 output

## Community Hubs (Navigation)
- FastAPI Request Models & Telemetry Synthesis
- FastAPI Server Routing & Static File Serving
- Route Simulator UI & Map Waypoint Interaction
- Lakehouse ETL Engine & Kinematics Calculator
- Medallion Data Lakehouse & Maritime Intelligence
- GitHub Actions CI/CD Packaging Pipeline
- Telemetry Viewer Client & Track Visualizer
- Client-Side Trajectory Engine & Catmull-Rom Spline
- Universal App Shell & Solid Navigation Architecture
- Medallion Architecture Concept
- Palantir Foundry Maritime Overview

## God Nodes (most connected - your core abstractions)
1. `renderRoute()` - 13 edges
2. `build_trajectory()` - 11 edges
3. `simulate_ais()` - 9 edges
4. `loadCorridor()` - 9 edges
5. `compute_kinematics_for_series()` - 8 edges
6. `get_vessel_type_metadata()` - 8 edges
7. `generate_multi_leg_simulation()` - 8 edges
8. `process_silver_tier()` - 7 edges
9. `run_pipeline()` - 7 edges
10. `get_fleet_positions()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Voyage Telemetry Cockpit & Fleet Overview` --references--> `Universal Palantir App Shell`  [EXTRACTED]
  viewer.html → static/js/app_shell.js
- `AIS Synthetic Route Simulator & Studio` --references--> `Universal Palantir App Shell`  [EXTRACTED]
  index.html → static/js/app_shell.js
- `Ports & H3 Geofences Viewer` --references--> `Universal Palantir App Shell`  [EXTRACTED]
  ports.html → static/js/app_shell.js
- `spatA Spatial Analytics Workbench` --references--> `4-Tier Medallion Data Lakehouse`  [INFERRED]
  spatA/PRD_SDD.md → data/README.md
- `Voyage Telemetry Cockpit & Fleet Overview` --references--> `Point-to-Point Derived Kinematics`  [EXTRACTED]
  viewer.html → data/silver/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Medallion Trajectory Processing Flow** — data_raw_tier, data_bronze_tier, data_silver_tier, data_gold_tier [EXTRACTED 1.00]
- **Cross-Tool App Shell Integration** — ui_simulation_studio, ui_telemetry_viewer, ui_ports_geofences, ui_universal_app_shell [EXTRACTED 1.00]

## Communities (18 total, 9 thin omitted)

### Community 0 - "FastAPI Request Models & Telemetry Synthesis"
Cohesion: 0.06
Nodes (19): get_random_vessel(), simulate_ais(), SimulateRequest, auto_generate_dimensions(), build_trajectory(), interpolate_coord_at_dist(), compute_searoute(), destination_point() (+11 more)

### Community 1 - "FastAPI Server Routing & Static File Serving"
Cohesion: 0.07
Nodes (20): download_csv(), _generate_mmsi(), get_corridors(), get_datalake_markov(), get_datalake_status(), get_datalake_voyages(), get_fleet_positions(), get_ports() (+12 more)

### Community 2 - "Route Simulator UI & Map Waypoint Interaction"
Cohesion: 0.09
Nodes (40): addWaypoint(), availableCorridors, baseTileLayers, calculateTotalDistanceNM(), clearRoute(), closeResultModal(), currentVesselSpecs, deleteWaypointAt() (+32 more)

### Community 3 - "Lakehouse ETL Engine & Kinematics Calculator"
Cohesion: 0.10
Nodes (13): calculate_bearing(), compute_kinematics_for_series(), ensure_directories(), haversine_nm(), parse_iso_dt(), populate_raw_tier(), process_bronze_tier(), process_gold_tier() (+5 more)

### Community 4 - "Medallion Data Lakehouse & Maritime Intelligence"
Cohesion: 0.13
Nodes (20): Bronze Lake Tier (Canonical 10-Col Schema), 4 Mission-Critical Telemetry KPIs, Real-Time Fleet State Deck, Jensen-Shannon Divergence Predictability, 3rd-Order Markov Chain Predictor, Gold Lake Tier (Curated Maritime Intelligence), Top-3 Hex Prediction Spectrum, 4-Tier Medallion Data Lakehouse (+12 more)

### Community 5 - "GitHub Actions CI/CD Packaging Pipeline"
Cohesion: 0.10
Nodes (19): runs-on, steps, strategy, jobs, build, python-version, name, on (+11 more)

### Community 6 - "Telemetry Viewer Client & Track Visualizer"
Cohesion: 0.26
Nodes (13): baseTileLayers, calculateDistanceNM(), getSogColor(), initCsvUploadHandlers(), initViewerControls(), loadRunDetails(), loadRunsList(), parseUploadedCsv() (+5 more)

### Community 7 - "Client-Side Trajectory Engine & Catmull-Rom Spline"
Cohesion: 0.22
Nodes (8): RFC-4180, catmullRomSpline(), downloadCsvBlob(), generateRandomImo(), haversineDistanceM(), initialBearingDeg(), pingsToCsvString(), simulateTrajectoryClient()

### Community 8 - "Universal App Shell & Solid Navigation Architecture"
Cohesion: 0.83
Nodes (3): mountAppShell(), renderHeaderHtml(), renderSidebarHtml()

## Knowledge Gaps
- **6 isolated node(s):** `RFC-4180`, `Palantir Foundry Maritime Simulator`, `Medallion Data Lake Architecture`, `Jensen-Shannon Divergence Predictability`, `Real-Time Fleet State Deck` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 94 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `simulate_ais()` connect `FastAPI Request Models & Telemetry Synthesis` to `FastAPI Server Routing & Static File Serving`, `Lakehouse ETL Engine & Kinematics Calculator`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `RFC-4180`, `Palantir Foundry Maritime Simulator`, `Medallion Data Lake Architecture` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `FastAPI Request Models & Telemetry Synthesis` be split into smaller, more focused modules?**
  _Cohesion score 0.06280193236714976 - nodes in this community are weakly interconnected._
- **Should `FastAPI Server Routing & Static File Serving` be split into smaller, more focused modules?**
  _Cohesion score 0.06763285024154589 - nodes in this community are weakly interconnected._
- **Should `Route Simulator UI & Map Waypoint Interaction` be split into smaller, more focused modules?**
  _Cohesion score 0.0919661733615222 - nodes in this community are weakly interconnected._
- **Should `Lakehouse ETL Engine & Kinematics Calculator` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `Medallion Data Lakehouse & Maritime Intelligence` be split into smaller, more focused modules?**
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._