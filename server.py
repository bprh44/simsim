"""
AIS Simulator Web Application Server.
Exposes endpoints for:
  - Vessel type metadata & dimension generation (DuckDB-grounded)
  - Random vessel profile generation (MMSI, IMO, VesselName, CallSign)
  - Synthetic AIS path simulation with dynamic kinematics & stochastic intervals
  - Output CSV management, viewing, and direct downloads
  - Dual Web UI: Interactive Route Simulator (/), Historical Run Viewer (/viewer)
"""

import os
import glob
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import simulator_engine

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

app = FastAPI(
    title="Maritime AIS Synthetic Route Simulator",
    description="Interactive web platform for drawing synthetic vessel tracks and synthesizing Class A AIS telemetry.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SimulateRequest(BaseModel):
    waypoints: List[List[float]]  # [[lat, lon], ...]
    vessel_profile: Dict[str, Any]
    num_legs: int = 1  # 1 to 50 scheduled commute legs
    port_dwell_hours: float = 5.0  # Hours moored in port between legs
    timing_mode: str = "forward"  # "forward" or "reverse"
    reference_time: Optional[str] = None  # ISO format string or None
    desired_speed_knots: Optional[float] = None
    allow_open_sea_boost: bool = False
    segment_speeds: Optional[List[float]] = None
    anomaly_config: Optional[Dict[str, Any]] = None  # target_leg, anomaly_type, delay_hours, etc.
    min_ping_gap_s: int = 15
    max_ping_gap_s: int = 120
    max_dropout_gap_s: int = 600
    dropout_probability: float = 0.03
    custom_filename: Optional[str] = None


@app.get("/api/corridors")
def get_corridors():
    """Returns curated authentic maritime corridors for Japan, Korea, and China."""
    return JSONResponse(content=simulator_engine.CORRIDORS)


@app.get("/api/vessel_types")
def get_vessel_types():
    """Returns historical vessel types and typical dimensional specs."""
    return JSONResponse(content=simulator_engine.VESSEL_SPECS)


@app.get("/api/random_vessel")
def get_random_vessel(vessel_type: Optional[int] = Query(None)):
    """Generates an authentic vessel profile with randomized identifiers and dimensions."""
    if vessel_type is None:
        # Default to Passenger Ferry (60), Cargo (70) or Container (71)
        vessel_type = random.choice([60, 70, 71, 80])
    
    dims = simulator_engine.auto_generate_dimensions(vessel_type)
    meta = simulator_engine.get_vessel_type_metadata(vessel_type)
    
    profile = {
        "MMSI": simulator_engine.generate_random_mmsi(),
        "IMO": simulator_engine.generate_random_imo(),
        "VesselName": simulator_engine.generate_random_name(),
        "CallSign": simulator_engine.generate_random_callsign(),
        "VesselType": vessel_type,
        "VesselTypeLabel": meta.get("label", f"Type {vessel_type}"),
        "Length": dims["Length"],
        "Width": dims["Width"],
        "Draft": dims["Draft"],
        "Cargo": "All ships of this type",
        "TransceiverClass": "A",
        "TypicalCruiseSpeed": meta.get("cruise_sog", 18.0)
    }
    return JSONResponse(content=profile)


@app.post("/api/simulate")
def simulate_ais(req: SimulateRequest):
    """Executes the simulation engine and writes the resulting CSV output."""
    if len(req.waypoints) < 2:
        raise HTTPException(status_code=400, detail="At least 2 waypoints are required to simulate a trajectory.")

    # Parse reference time if provided
    ref_dt = None
    if req.reference_time and req.reference_time.strip():
        try:
            clean_str = req.reference_time.replace("Z", "+00:00")
            ref_dt = datetime.fromisoformat(clean_str)
        except Exception:
            ref_dt = datetime.now()

    # Convert waypoints to list of tuples
    wpt_tuples = [(pt[0], pt[1]) for pt in req.waypoints]

    legs_meta = None
    if req.num_legs > 1 or (req.anomaly_config and req.anomaly_config.get("enabled", True)):
        # Run Multi-Leg Scheduled Loop Simulation
        pings, legs_meta = simulator_engine.generate_multi_leg_simulation(
            waypoints=wpt_tuples,
            vessel_profile=req.vessel_profile,
            num_legs=req.num_legs,
            port_dwell_hours=req.port_dwell_hours,
            start_time=ref_dt,
            desired_speed_knots=req.desired_speed_knots,
            allow_open_sea_boost=req.allow_open_sea_boost,
            anomaly_config=req.anomaly_config,
            min_ping_gap_s=req.min_ping_gap_s,
            max_ping_gap_s=req.max_ping_gap_s,
            max_dropout_gap_s=req.max_dropout_gap_s,
            dropout_probability=req.dropout_probability
        )
    else:
        # Single Leg Simulation
        pings = simulator_engine.build_trajectory(
            waypoints=wpt_tuples,
            vessel_profile=req.vessel_profile,
            timing_mode=req.timing_mode,
            reference_time=ref_dt,
            desired_speed_knots=req.desired_speed_knots,
            allow_open_sea_boost=req.allow_open_sea_boost,
            segment_speeds=req.segment_speeds,
            min_ping_gap_s=req.min_ping_gap_s,
            max_ping_gap_s=req.max_ping_gap_s,
            max_dropout_gap_s=req.max_dropout_gap_s,
            dropout_probability=req.dropout_probability
        )

    # Save to CSV
    csv_path = simulator_engine.save_trajectory_to_csv(
        pings=pings,
        output_dir=OUTPUT_DIR,
        custom_filename=req.custom_filename
    )
    csv_filename = os.path.basename(csv_path)

    # Compute trajectory summary statistics
    total_m = 0.0
    for i in range(1, len(pings)):
        total_m += simulator_engine.haversine_distance_m(
            pings[i-1]["LAT"], pings[i-1]["LON"],
            pings[i]["LAT"], pings[i]["LON"]
        )
    total_nm = round(total_m * simulator_engine.M_TO_NM, 2)
    sogs = [p["SOG"] for p in pings]
    avg_sog = round(sum(sogs) / max(1, len(sogs)), 1)
    max_sog = round(max(sogs) if sogs else 0.0, 1)

    # Save metadata JSON alongside CSV for instant viewer loading
    meta_filename = csv_filename.replace(".csv", ".meta.json")
    meta_path = os.path.join(OUTPUT_DIR, meta_filename)
    meta_info = {
        "csv_filename": csv_filename,
        "vessel_profile": req.vessel_profile,
        "num_legs": req.num_legs,
        "port_dwell_hours": req.port_dwell_hours,
        "timing_mode": req.timing_mode,
        "allow_open_sea_boost": req.allow_open_sea_boost,
        "desired_speed_knots": req.desired_speed_knots,
        "total_nm": total_nm,
        "ping_count": len(pings),
        "avg_sog": avg_sog,
        "max_sog": max_sog,
        "start_time": pings[0]["BaseDateTime"] if pings else None,
        "end_time": pings[-1]["BaseDateTime"] if pings else None,
        "waypoints": req.waypoints,
        "legs_metadata": legs_meta,
        "created_at": datetime.now().isoformat()
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta_info, f, indent=2)

    return JSONResponse(content={
        "success": True,
        "csv_filename": csv_filename,
        "download_url": f"/api/download/{csv_filename}",
        "stats": {
            "total_nm": total_nm,
            "ping_count": len(pings),
            "avg_sog": avg_sog,
            "max_sog": max_sog,
            "start_time": pings[0]["BaseDateTime"] if pings else None,
            "end_time": pings[-1]["BaseDateTime"] if pings else None,
        },
        "pings": pings,
        "waypoints": req.waypoints
    })


@app.get("/api/runs")
def list_runs():
    """Lists all previously simulated runs saved in the output directory."""
    runs = []
    csv_files = glob.glob(os.path.join(OUTPUT_DIR, "*.csv"))
    # Sort newest first
    csv_files.sort(key=os.path.getmtime, reverse=True)

    for cf in csv_files:
        fname = os.path.basename(cf)
        mtime = datetime.fromtimestamp(os.path.getmtime(cf)).strftime("%Y-%m-%d %H:%M:%S")
        size_kb = round(os.path.getsize(cf) / 1024, 1)

        # Check for companion metadata
        meta_file = cf.replace(".csv", ".meta.json")
        meta = {}
        if os.path.exists(meta_file):
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                pass

        runs.append({
            "filename": fname,
            "modified_at": mtime,
            "size_kb": size_kb,
            "vessel_name": meta.get("vessel_profile", {}).get("VesselName", fname),
            "mmsi": meta.get("vessel_profile", {}).get("MMSI", "-"),
            "vessel_type": meta.get("vessel_profile", {}).get("VesselType", "-"),
            "ping_count": meta.get("ping_count", 0),
            "total_nm": meta.get("total_nm", 0),
            "start_time": meta.get("start_time", "-"),
            "end_time": meta.get("end_time", "-")
        })

    return JSONResponse(content=runs)


@app.get("/api/runs/{filename}")
def get_run_details(filename: str):
    """Retrieves full telemetry pings and metadata for a specific saved run."""
    import csv

    # Security check: prevent directory traversal
    clean_name = os.path.basename(filename)
    csv_path = os.path.join(OUTPUT_DIR, clean_name)
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="Run not found.")

    pings = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pings.append({
                "MMSI": int(row["MMSI"]) if row.get("MMSI") else None,
                "BaseDateTime": row.get("BaseDateTime", ""),
                "LAT": float(row["LAT"]) if row.get("LAT") else 0.0,
                "LON": float(row["LON"]) if row.get("LON") else 0.0,
                "SOG": float(row["SOG"]) if row.get("SOG") else 0.0,
                "COG": float(row["COG"]) if row.get("COG") else 0.0,
                "Heading": float(row["Heading"]) if row.get("Heading") else 0.0,
                "VesselName": row.get("VesselName", ""),
                "IMO": row.get("IMO", ""),
                "CallSign": row.get("CallSign", ""),
                "VesselType": int(row["VesselType"]) if row.get("VesselType") else 0,
                "Status": int(row["Status"]) if row.get("Status") else 0
            })

    meta_file = csv_path.replace(".csv", ".meta.json")
    meta = {}
    if os.path.exists(meta_file):
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            pass

    return JSONResponse(content={
        "filename": clean_name,
        "meta": meta,
        "pings": pings
    })


@app.get("/api/download/{filename}")
def download_csv(filename: str):
    """Directly streams the requested CSV file to browser for download."""
    clean_name = os.path.basename(filename)
    csv_path = os.path.join(OUTPUT_DIR, clean_name)
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(
        csv_path,
        media_type="text/csv",
        filename=clean_name
    )


# Serve Static UI Assets & Pages
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def serve_index():
    index_path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse(content={"message": "AIS Simulator is running. Missing index.html."})


@app.get("/viewer")
def serve_viewer():
    viewer_path = os.path.join(BASE_DIR, "viewer.html")
    if os.path.exists(viewer_path):
        return FileResponse(viewer_path)
    return JSONResponse(content={"message": "Viewer is running. Missing viewer.html."})


if __name__ == "__main__":
    import uvicorn
    import random
    port = 8765
    print(f"Starting AIS Simulator Server on http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
