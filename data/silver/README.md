# Silver Tier (Cleansed, IDLE-Segmented Voyages & Derived Kinematics)

## Overview
Enriches canonical AIS streams with point-to-point calculated kinematics, Uber H3 Res 8/7 spatial indices, strict IDLE state detection (`< 2.0 kt` in 1 single `h3_res8` cell for `>= 1800s`), and stop-to-stop Silver Voyage segmentation (`silver_voyages.json` & `silver_voyages` DuckDB table).

## Silver IDLE & Stop-to-Stop Voyage Segmentation Rules
1. **IDLE Condition**: Speed (`SOG` or `calc_sog_kts`) `< 2.0 kt` continuously within **1 single H3 Res 8 cell (`h3_res8`)** for `>= 30 minutes (1800 seconds)`.
2. **Start of Voyage**: The **latest timestamp the vessel was IDLE** in the departure stop (final ping of departure IDLE block right before moving).
3. **End of Voyage**: The **first moment an IDLE has formed (after 30 minutes)** at the arrival stop (exact ping where cumulative duration `< 2.0 kt` in a single `h3_res8` cell reaches `>= 1800 seconds`).
4. **Previous Dwell Time**: Pings after the 30-minute IDLE formation threshold up until the next departure belong to the port dwell state (`DWELL-XX`), and the stop duration is recorded as `prior_dwell_time_hrs` / `prior_dwell_formatted` on the subsequent voyage.

## Calculated Kinematic Fields
- `calc_sog_kts`: Derived speed in knots ($v_i = \Delta d_i / \Delta t_i$).
- `calc_sog_mps`: Derived speed in $\text{m/s}$ ($v_i \times 0.514444$).
- `calc_cog_deg`: Derived great circle forward heading/bearing ($[0, 360)^\circ$).
- `calc_accel_kts_min`: Acceleration in knots per minute ($\Delta v / \Delta t$).
- `calc_rot_deg_min`: Rate of turn angular velocity ($^\circ/\text{min}$).
- `motion_state`: Motion state (`IDLE`, `MOORED`, `ACCELERATING`, `CRUISING`, `DECELERATING`).
- `is_idle`, `idle_cell_duration_s`: Boolean IDLE flag and cumulative duration in single `h3_res8` cell.
- `h3_res8`, `h3_res7`: Uber H3 hexagonal spatial grid cells.
- `point_safety_score`: 0-100 anomaly composite safety metric.
- `voyage_id`, `global_voyage_id`: Clean per-vessel voyage code (`VOY-01`) and globally unique ID (`VOY_<STEM>_01`).
