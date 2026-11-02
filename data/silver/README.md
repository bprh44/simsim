# Silver Tier (Cleansed, Segmented & Derived Kinematics)

## Overview
Enriches canonical AIS streams with point-to-point calculated kinematics directly from coordinates and timestamps.

## Calculated Kinematic Fields
- `calc_sog_kts`: Derived speed in knots ($v_i = \Delta d_i / \Delta t_i$).
- `calc_sog_mps`: Derived speed in $	ext{m/s}$ ($v_i 	imes 0.514444$).
- `calc_cog_deg`: Derived great circle forward heading/bearing ($[0, 360)^\circ$).
- `calc_accel_kts_min`: Acceleration in knots per minute ($\Delta v / \Delta t$).
- `calc_accel_mps2`: Acceleration in $	ext{m/s}^2$.
- `calc_rot_deg_min`: Rate of turn angular velocity ($^\circ/	ext{min}$).
- `motion_state`: Motion state (`ACCELERATING`, `CRUISING`, `DECELERATING`, `MOORED`).
- `h3_res8`, `h3_res7`: Uber H3 hexagonal spatial grid cells.
- `point_safety_score`: 0-100 anomaly composite safety metric.
