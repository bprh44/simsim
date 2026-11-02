import urllib.request
import json

routes = [
    {
        "name": "1_Incheon_to_Fukuoka",
        "waypoints": [
            [37.4520, 126.6015],
            [37.1500, 126.1500],
            [36.3000, 125.8000],
            [35.1000, 125.6000],
            [34.1500, 126.3000],
            [33.8500, 127.5000],
            [34.0500, 129.2000],
            [33.8000, 129.9500],
            [33.6065, 130.3950]
        ],
        "vessel_type": 70, # Cargo
        "desired_speed": 16.5,
        "allow_open_sea_boost": True
    },
    {
        "name": "2_Tomakomai_to_Sendai",
        "waypoints": [
            [42.6320, 141.6250],
            [42.3000, 141.6000],
            [41.5500, 141.8000],
            [40.7500, 141.9500],
            [39.8000, 142.1500],
            [38.9000, 141.8500],
            [38.3000, 141.2500],
            [38.2750, 141.0250]
        ],
        "vessel_type": 60, # Ferry
        "desired_speed": 19.5,
        "allow_open_sea_boost": True
    },
    {
        "name": "3_Busan_to_Jeju",
        "waypoints": [
            [35.1028, 129.0403],
            [34.9500, 128.9500],
            [34.7000, 128.5500],
            [34.3000, 128.0000],
            [33.9500, 127.3500],
            [33.6500, 126.8500],
            [33.5240, 126.5410]
        ],
        "vessel_type": 60, # Passenger Ferry
        "desired_speed": 18.0,
        "allow_open_sea_boost": True
    }
]

for r in routes:
    vt = r["vessel_type"]
    res = urllib.request.urlopen(f"http://127.0.0.1:8765/api/random_vessel?vessel_type={vt}")
    vessel = json.loads(res.read().decode())
    
    payload = {
        "waypoints": r["waypoints"],
        "vessel_profile": vessel,
        "timing_mode": "forward",
        "desired_speed_knots": r["desired_speed"],
        "allow_open_sea_boost": r["allow_open_sea_boost"],
        "min_ping_gap_s": 15,
        "max_ping_gap_s": 120,
        "max_dropout_gap_s": 600,
        "dropout_probability": 0.03,
        "custom_filename": f"{r['name']}_{vessel['MMSI']}.csv"
    }
    
    req = urllib.request.Request(
        "http://127.0.0.1:8765/api/simulate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    res_sim = urllib.request.urlopen(req)
    out = json.loads(res_sim.read().decode())
    print(f"Generated {r['name']}:")
    print(f"  Vessel: {vessel['VesselName']} (MMSI: {vessel['MMSI']}, Type: {vessel['VesselTypeLabel']})")
    print(f"  File: {out['csv_filename']}")
    print(f"  Stats: {out['stats']}\n")
