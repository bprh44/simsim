# Maritime Spatiotemporal Data Lakehouse Architecture

A Medallion Architecture (`raw` > `bronze` > `silver` > `gold`) for AIS vessel trajectory analytics, kinematics derivation, and high-order Markov trajectory prediction.

```
data/
├── raw/                      # Landing Zone: Untransformed source CSVs and sensor dumps
│   ├── busan_test_raw.csv
│   └── new_camellia_30days_raw.csv
│
├── bronze/                   # Standardized Ingestion: 10-column canonical schema
│   ├── busan_bronze.csv
│   ├── new_camellia_bronze.csv
│   └── bronze_ingestion_audit.json
│
├── silver/                   # Enriched & Cleansed: Filtered, Segmented & Derived Kinematics
│   ├── busan_silver.csv
│   ├── busan_silver.json
│   ├── new_camellia_silver.csv
│   └── silver_kinematics_audit.json
│
└── gold/                     # Curated Intelligence & Analytical Model Serving Layer
    ├── voyages_summary.json  # 4 Key Metrics: Distance, Avg Speed, Prior Dwell, Safety Index
    ├── h3_corridors.json     # Trajectory corridors & idle mooring clusters (H3 Res 8)
    ├── markov_models/        # 3rd-Order Markov transition matrices & Top-3 predictions (Red/Orange/Yellow)
    ├── predictability/       # Jensen-Shannon Divergence route predictability
    └── fleet/                # Real-time fleet positions & derived kinematics
```

## Analytics Placement Across the Lakes:
1. **Raw**: Zero analytics. Pure landing zone for incoming data feeds.
2. **Bronze**: Ingestion Quality Analytics (record counts, bounding boxes, sampling gap histograms).
3. **Silver**: Point-Level Kinematics Analytics:
   - Calculated Speed ($v_i = \Delta d_i / \Delta t_i$ in knots and m/s)
   - Calculated Heading ($	heta_i = \text{Bearing}(p_{i-1} \to p_i)$)
   - Calculated Acceleration ($a_i = \Delta v_i / \Delta t_i$ in kts/min and $\text{m/s}^2$)
   - Rate of Turn ($\text{ROT}_i = \Delta\theta_i / \Delta t_i$ in $^\circ/\text{min}$)
   - Point Anomaly Penalties & Point Safety Score ($0 - 100$)
   - Uber H3 Spatial Indices (Resolution 8 & 7)
4. **Gold**: High-Order Trajectory Intelligence & Serving Layer:
   - 4 Mission-Critical Voyage KPIs (Distance, Avg Speed, Prior Dwell Time, Safety Index 0-100)
   - 3rd-Order Markov Chain Transitions ($P(C_{t+1} \mid C_t, C_{t-1}, C_{t-2})$)
   - Top-3 Predicted Hex Cells (Red = Rank 1, Orange = Rank 2, Yellow = Rank 3)
   - Jensen-Shannon Divergence (JSD) Route Predictability Index
   - Fleet Operational State & Real-Time Risk Matrix
