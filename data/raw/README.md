# Raw Tier (Landing Zone)

## Overview
Stores unmodified, pristine source files as received from external providers, port AIS feeds, and simulation exports.

## Invariant Rules
- **Immutable**: Never modify or overwrite existing files in this directory.
- **Preserve Anomalies**: Sensor drops, GPS jumps, and raw header casings are preserved exactly as landed.

## Files
- `busan_test_raw.csv`: High-resolution real-world Busan North Port -> Hakata departure stream (622 pings).
- `new_camellia_30days_raw.csv`: 30-day continuous Ro-Pax commercial ferry transit stream (20,043 pings).
