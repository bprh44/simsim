# AIS Spatiotemporal Analytics Tool
## Product Requirements Document (PRD) & System Design Document (SDD)

---

# Part 1: Product Requirements Document (PRD)

## 1. Executive Summary & Objective
Vessel Automatic Identification System (AIS) datasets contain millions of broadcast points capturing maritime traffic, anchorage activity, and transit corridors. Analyzing high-density patterns requires rapid spatial aggregation and spatial clustering. 

This tool provides an interactive analytical interface embedded or linked within a JupyterHub environment. Users can load raw AIS CSV datasets (either via direct upload or direct POSIX path pointing), filter dynamically across diurnality (time-of-day windows) and days-of-week, aggregate points into Uber H3 discrete global grid systems (DGGS) for high performance, and run on-the-fly spatial clustering (e.g., DBSCAN / HDBSCAN) to identify and rank the **Top-$N$ hot spots of maritime activity**.

---

## 2. User Personas & Use Cases

### 2.1 Personas
* **Maritime Data Scientist / Analyst:** Wants to quickly discover bottlenecks, illegal transshipment rendezvous, or anchorage patterns without running slow, manual batch SQL/Pandas scripts.
* **Port Operations Manager:** Wants to inspect congestion between business hours (e.g., 08:00–17:00) versus night hours across weekdays to adjust pilotage resources.

### 2.2 Key Use Cases
1. **Interactive Path / Direct Upload Selection:** Mount a large dataset from `/home/jovyan/...` or upload a sample CSV.
2. **Diurnal Slice Analysis:** Filter traffic across all active days strictly between `08:00` and `17:00` to analyze shift-based port density.
3. **Multi-Scale Spatial Aggregation:** Toggle between raw point broadcasts (scatter) and aggregated Uber H3 hexagonal bins at configurable resolutions (e.g., H3 resolution 7 to 9).
4. **Real-Time Spatial Hotspot Discovery:** Trigger DBSCAN clustering to isolate distinct dense spatial hulls and dynamically rank the top $N$ densest regions.

---

## 3. Functional Requirements

### 3.1 Data Ingestion & Source Selection
* **FR-1.1 Local Path Pointing:** Provide an input text field to read CSV files directly from the JupyterHub user storage path (e.g., `/home/jovyan/data/ais_gulf_stream/`).
* **FR-1.2 Web File Upload:** Provide a drag-and-drop file uploader for local client files ($\le 500\text{ MB}$).
* **FR-1.3 Schema Validation:** Automatically validate and map standard AIS schema headers:
  * Timestamp: `timestamp`, `BaseDateTime`, or `datetime` (ISO-8601 or standard epoch).
  * Coordinates: `latitude` / `lat`, `longitude` / `lon`.
  * Vessel Identifier: `MMSI` or `IMO`.
  * Optional: `SOG` (Speed Over Ground), `COG` (Course Over Ground), `VesselType`.

### 3.2 Temporal Filtering
* **FR-2.1 Diurnal Time-of-Day Filter:** Dual-handle slider specifying time range (e.g., `08:00` to `17:00`). The filter applies across every selected calendar day.
* **FR-2.2 Day-of-Week Checkboxes:** Checkbox group (`[x] Mon [x] Tue [x] Wed [x] Thu [x] Fri [ ] Sat [ ] Sun`) to isolate weekday vs. weekend patterns.
* **FR-2.3 Date Range Filter:** Calendar date picker or bounded range slider for start date and end date.

### 3.3 Spatial Representation & H3 Indexing
* **FR-3.1 H3 Spatial Indexing:** Compute H3 hex cell indices based on latitude and longitude coordinates.
* **FR-3.2 Dynamic Resolution Control:** Allow the user to adjust H3 resolution (typically $R \in [6, 10]$ where $R=7 \approx 5.16\text{ km}^2$, $R=8 \approx 0.74\text{ km}^2$, $R=9 \approx 0.10\text{ km}^2$).
* **FR-3.3 Dual Layer Rendering:**
  * **Point Scatter Layer:** Individual AIS pings (with downsampling/WebGL instancing for performance).
  * **H3 Hexagon Density Layer:** Hexagonal polygons color-ramped by point count or unique vessel count.
  * **Layer Visibility Controls:** Checkboxes to independently toggle raw points and H3 grid overlays.

### 3.4 Real-Time Clustering & Hot Spot Ranking
* **FR-4.1 Clustering Algorithm Execution:** Run spatial clustering (DBSCAN / HDBSCAN) on filtered points or hex centroids.
* **FR-4.2 Real-Time Hyperparameter Tuning:** Expose interactive sliders for:
  * $\epsilon$ (Epsilon / Neighborhood radius in meters/kilometers).
  * $\text{min\_samples}$ (Minimum points to form a core cluster).
* **FR-4.3 Top-$N$ Ranking Panel:**
  * Sidebar display listing the top $N$ clusters (default $N=5$, configurable up to 20).
  * Metrics per cluster: Total AIS ping count, unique vessel count (`count(distinct MMSI)`), and average SOG.
  * Click-to-focus: Clicking a cluster in the list automatically flies the map viewport to that cluster's convex hull / bounding box.

---

## 4. Non-Functional Requirements (NFRs)
* **NFR-1 Latency & Responsiveness:** Filter updates (time slider / day toggles) must update the viewport within $\le 300\text{ ms}$ for datasets up to $10^6$ rows.
* **NFR-2 Memory Footprint:** Process data using columnar, zero-copy, or out-of-core memory structures (e.g., Apache Arrow / DuckDB / Polars) to prevent JupyterHub pod OOM (Out Of Memory) kills.
* **NFR-3 Extensibility:** The user interface should seamlessly render inside a Jupyter Notebook output cell (via AnyWidget/Ipywidgets) or as a standalone browser web dashboard (via Streamlit, Panel, or FastAPI + React).

---
---

# Part 2: System Design Document (SDD)

## 1. High-Level Architecture Overview

The system uses a decoupled frontend-backend model optimized for high-performance geospatial processing inside containerized Jupyter environments:

```
+-----------------------------------------------------------------------------------+
|                            Client (Browser UI / WebGL)                            |
|  - Maplibre GL / Deck.gl (ScatterplotLayer, H3HexagonLayer, PolygonLayer)         |
|  - Control Panel (Time-of-day slider, Day checkboxes, H3 Res slider, DBSCAN args) |
+------------------------------------------^----------------------------------------+
                                           | Arrow IPC / GeoJSON / WebSocket
+------------------------------------------v----------------------------------------+
|                      Execution Engine (JupyterHub Kernel / API)                    |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Ingestion & Query Layer (DuckDB / Polars)                                    |  |
|  | - Direct POSIX reading from /home/jovyan/ via zero-copy mmap                |  |
|  | - Temporal predicate pushdown: strftime('%H:%M'), dayofweek()               |  |
|  +-----------------------------------------------------------------------------+  |
|                                          |                                        |
|  +---------------------------------------v-------------------------------------+  |
|  | Spatial Indexing & Clustering Engine                                         |  |
|  | - h3-py: Fast Lat/Lon -> H3 index mapping                                   |  |
|  | - PyDeck / Deck.gl: GPU-accelerated hexagon aggregation                     |  |
|  | - scikit-learn / cuML: DBSCAN (Metric: Haversine or Euclidean on projected) |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Component Specifications

### 2.1 Storage & Query Engine (DuckDB)
* Rather than loading the entire CSV into naive Pandas DataFrames, **DuckDB** is used as an embedded in-memory OLAP engine.
* DuckDB can query raw CSV files directly via POSIX path without copying:
  ```sql
  SELECT 
      mmsi,
      lat,
      lon,
      epoch_ms,
      sog
  FROM read_csv_auto('/home/jovyan/data/*.csv')
  WHERE 
      CAST(strftime(to_timestamp(epoch_ms / 1000), '%H') AS INT) BETWEEN 8 AND 17
      AND dayofweek(to_timestamp(epoch_ms / 1000)) IN (1, 2, 3, 4, 5);
  ```
* This achieves execution speeds that are an order of magnitude faster and prevents Python memory explosion.

### 2.2 Spatial Indexing Strategy (H3 DGGS)
1. **Hex Assignment:** For raw records matching the temporal filter, lat/lon points are converted to H3 cells:
   $$\text{h3\_index} = \text{geo\_to\_h3}(\text{lat}, \text{lon}, \text{resolution})$$
2. **Aggregated Cell Representation:** 
   Compute group-by statistics per cell:
   * `ping_count = COUNT(*)`
   * `unique_vessels = COUNT(DISTINCT mmsi)`
3. **Thresholding for Clustering Acceleration:**
   Running DBSCAN over millions of raw pings in real-time can be computationally prohibitive ($\mathcal{O}(N^2)$ or $\mathcal{O}(N \log N)$). 
   * **Acceleration Optimization:** Run DBSCAN directly over the **centroids of active H3 hexes weighted by point count**, rather than every individual raw ping. This reduces $N$ by orders of magnitude while preserving spatial density fidelity.

### 2.3 Clustering Engine (DBSCAN)
* **Coordinate Projection:** Convert spherical coordinates $(\text{lat}, \text{lon})$ to radians to use the spherical haversine metric:
  $$\text{dist}_{\text{haversine}}(u, v) = 2R \arcsin \sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}$$
  where $R \approx 6,371\text{ km}$.
* **Epsilon Formulation:** $\epsilon$ parameter is represented in kilometers and converted to radian space ($\epsilon_{\text{rad}} = \epsilon_{\text{km}} / 6371.0$).
* **Cluster Extraction:**
  * Isolate core, border, and noise points.
  * Noise points (label `-1`) are discarded from the hotspot list.
  * Cluster hulls are computed using 2D Convex Hull (`scipy.spatial.ConvexHull`) to draw visual bounding polygons on the map.

---

## 3. Data Flow Diagram

```
[User Action: Adjusts 8am-5pm & Mon-Fri]
                   │
                   ▼
[DuckDB Temporal Predicate Pushdown] ──────► [Filtered Record Batch]
                                                        │
                                                        ▼
                                             [h3-py Hex Resolution Aggregation]
                                                        │
                                                        ├──► [H3 Layer Deck.gl Viewport]
                                                        │
                                                        ▼
                                             [DBSCAN on Active Hex Centroids]
                                                        │
                                                        ├──► [Top-N Ranked Cluster List]
                                                        └──► [Cluster Hull Polygon Layer]
```

---

## 4. Proposed Technical Implementation (Interactive Prototype)

A turnkey implementation utilizing **Streamlit** (or Voila/AnyWidget within JupyterLab) with **DuckDB**, **h3-py**, and **PyDeck**:

```python
import streamlit as st
import duckdb
import h3
import numpy as np
import pandas as pd
import pydeck as pdk
from sklearn.cluster import DBSCAN
from scipy.spatial import ConvexHull

st.set_page_config(layout="wide", page_title="AIS H3 Spatiotemporal Clusterer")

# 1. Data Source Selection
st.sidebar.header("Data Ingestion")
data_source = st.sidebar.radio("Data Mode", ["JupyterHub POSIX Path", "File Upload"])

path = None
if data_source == "JupyterHub POSIX Path":
    path = st.sidebar.text_input("POSIX File Path", "/home/jovyan/work/ais_data.csv")
else:
    uploaded_file = st.sidebar.file_uploader("Upload AIS CSV", type=["csv"])
    if uploaded_file:
        path = uploaded_file

# 2. Temporal Filters
st.sidebar.header("Diurnal & Day Filters")
time_range = st.sidebar.slider("Diurnal Window (Hour of Day)", 0, 23, (8, 17))
days_of_week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
selected_days = st.sidebar.multiselect("Active Days", days_of_week, default=["Mon", "Tue", "Wed", "Thu", "Fri"])

# 3. Spatial & Clustering Controls
st.sidebar.header("H3 & Clustering Parameters")
h3_res = st.sidebar.slider("H3 Resolution", min_value=6, max_value=10, value=8)
eps_km = st.sidebar.slider("DBSCAN Epsilon (km)", 0.5, 20.0, 3.0, 0.5)
min_samples = st.sidebar.slider("DBSCAN Min Samples", 2, 50, 5)
top_n = st.sidebar.slider("Top N Clusters", 1, 20, 5)

if path:
    # Query DuckDB with temporal filters applied
    day_indices = [days_of_week.index(d) for d in selected_days]
    
    con = duckdb.connect()
    query = f"""
    SELECT 
        CAST(lat AS DOUBLE) as lat, 
        CAST(lon AS DOUBLE) as lon, 
        mmsi,
        CAST(strftime(to_timestamp(epoch_s), '%H') AS INT) as hour,
        dayofweek(to_timestamp(epoch_s)) - 1 as dow
    FROM read_csv_auto('{path}')
    WHERE hour BETWEEN {time_range[0]} AND {time_range[1]}
      AND dow IN ({','.join(map(str, day_indices))})
    """
    df = con.execute(query).df()
    
    if not df.empty:
        # H3 Spatial Aggregation
        df['h3_cell'] = df.apply(lambda r: h3.geo_to_h3(r['lat'], r['lon'], h3_res), axis=1)
        
        hex_summary = df.groupby('h3_cell').agg(
            ping_count=('lat', 'count'),
            unique_vessels=('mmsi', 'nunique'),
            lat=('lat', 'mean'),
            lon=('lon', 'mean')
        ).reset_index()

        # Spatial DBSCAN on Cell Centroids (Radians for Haversine)
        coords_rad = np.radians(hex_summary[['lat', 'lon']].values)
        kms_per_radian = 6371.0088
        epsilon_rad = eps_km / kms_per_radian
        
        db = DBSCAN(eps=epsilon_rad, min_samples=min_samples, metric='haversine')
        hex_summary['cluster'] = db.fit_predict(coords_rad)

        # Rank Top N Clusters
        valid_clusters = hex_summary[hex_summary['cluster'] != -1]
        cluster_rank = (
            valid_clusters.groupby('cluster')
            .agg(total_pings=('ping_count', 'sum'), total_vessels=('unique_vessels', 'sum'))
            .sort_values(by='total_pings', ascending=False)
            .head(top_n)
            .reset_index()
        )

        col1, col2 = st.columns([3, 1])

        with col1:
            # PyDeck Visualizations: H3 Grid + Raw Dots
            h3_layer = pdk.Layer(
                "H3HexagonLayer",
                hex_summary,
                get_hexagon="h3_cell",
                get_fill_color="[255, (1 - ping_count / 100) * 255, 0, 140]",
                get_elevation="ping_count",
                elevation_scale=5,
                elevation_range=[0, 1000],
                pickable=True,
                auto_highlight=True,
            )
            
            scatter_layer = pdk.Layer(
                "ScatterplotLayer",
                df.sample(min(len(df), 50000)), # Downsampled for scatter view
                get_position=["lon", "lat"],
                get_radius=15,
                get_fill_color=[0, 200, 255, 100],
                pickable=False
            )

            view_state = pdk.ViewState(
                latitude=hex_summary['lat'].mean(),
                longitude=hex_summary['lon'].mean(),
                zoom=9,
                pitch=35
            )
            
            st.pydeck_chart(pdk.Deck(layers=[scatter_layer, h3_layer], initial_view_state=view_state))

        with col2:
            st.subheader(f"Top {top_n} Activity Hotspots")
            st.dataframe(cluster_rank)
    else:
        st.warning("No records matched the selected diurnal/day filters.")
```

---

## 5. Security, Scalability, and JupyterHub Deployment

1. **JupyterHub POSIX Path Isolation:**
   * Restrict path inputs to strictly inside `/home/jovyan/` via prefix validation to prevent path traversal attacks (`../../etc/passwd`).
2. **Worker Memory Limits:**
   * Enforce resource limits (`mem_limit: 4G` or `8G`) in JupyterHub Helm charts (`kubespawner`).
   * DuckDB runs natively in streaming mode to keep memory consumption bounded below pod limits.
3. **Decoupled Heavy Clustering:**
   * If point density exceeds $10^7$ rows, offload the DBSCAN step to GPU acceleration via **RAPIDS cuML** or aggregate strictly to H3 cell centroids before computing the distance matrix.