# Gold Tier (Maritime Intelligence & Model Serving)

## Overview
Business-level aggregations, high-order Markov transition matrices, and serving endpoints for the UI.

## Contents
1. `voyages_summary.json`: Curated Voyage KPIs (Distance, Avg Speed, Prior Dwell Time, Safety Index 0-100).
2. `h3_corridors.json`: Res 8 sequential corridors & idle mooring cluster polygons.
3. `markov_models/`:
   - `transition_matrix_res8.json`: 3rd-Order Markov chain transition matrix $P(C_{t+1} \mid C_t, C_{t-1}, C_{t-2})$.
   - `top3_predictions.json`: Top-3 prediction spectrum:
     - Rank 1 (Red `#ef4444`): 1st highest percentage.
     - Rank 2 (Orange `#f97316`): 2nd highest percentage.
     - Rank 3 (Yellow `#eab308`): 3rd highest percentage.
4. `predictability/jsd_metrics.json`: Jensen-Shannon Divergence predictability scores.
5. `fleet/fleet_current_state.json`: Real-time fleet overview state.
