"""
AIS Simulator Web Application Server.
Exposes endpoints for:
  - Canonical 10-column telemetry synthesis (DateTime, LAT, LON, SOG, COG, Heading, Name, IMO, Type, Status)
  - Historical vessel profile scanning from output directory (/api/vessels/history)
  - Authentic commercial vessel profile generation (/api/random_vessel)
  - NGA World Port Index querying & caching (/api/ports)
  - Synthetic AIS path simulation with dynamic kinematics & stochastic intervals
  - Output CSV management, viewing, and direct downloads
  - Dual Web UI: Interactive Route Simulator (/), Historical Run Viewer (/viewer)
"""

import os
import glob
import json
import random
import csv
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
    version="2.0.0"
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


@app.get("/api/ports")
def get_ports(q: str = Query("", description="Search term for port name, UN/LOCODE or index"),
              country: str = Query("", description="Country name filter"),
              limit: int = Query(50, description="Max ports to return")):
    """Returns authoritative ports from reference/wpi_nga_ports.csv."""
    ports = simulator_engine.load_wpi_ports(query=q, country=country, limit=limit)
    return JSONResponse(content={
        "total": len(ports),
        "limit": limit,
        "ports": ports
    })


@app.get("/api/vessels/history")
def get_vessels_history():
    """
    Scans the output/ directory for unique vessels previously simulated.
    Returns deduplicated list with Name, IMO, Type, TypeLabel, and run count.
    """
    history_map = {}
    csv_files = glob.glob(os.path.join(OUTPUT_DIR, "*.csv"))
    # Sort files by modification date (newest first)
    csv_files.sort(key=os.path.getmtime, reverse=True)

    for cf in csv_files:
        meta_file = cf.replace(".csv", ".meta.json")
        name = None
        imo = None
        v_type = 70
        v_label = None
        mod_time = datetime.fromtimestamp(os.path.getmtime(cf)).strftime("%Y-%m-%d %H:%M")

        if os.path.exists(meta_file):
            try:
                with open(meta_file, "r", encoding="utf-8") as mf:
                    meta = json.load(mf)
                    vp = meta.get("vessel_profile", {})
                    name = vp.get("Name") or vp.get("VesselName")
                    imo = vp.get("IMO")
                    v_type = vp.get("Type") or vp.get("VesselType") or 70
                    v_label = vp.get("TypeLabel") or vp.get("VesselTypeLabel")
            except Exception:
                pass

        if not name or not imo:
            # Fallback: inspect first 2 rows of CSV
            try:
                with open(cf, "r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    row = next(reader, None)
                    if row:
                        name = name or row.get("Name") or row.get("VesselName")
                        imo = imo or row.get("IMO")
                        if not v_type:
                            v_type = int(row.get("Type") or row.get("VesselType") or 70)
            except Exception:
                pass

        if name and imo:
            key = f"{name.strip().upper()}___{imo.strip().upper()}"
            if key not in history_map:
                if not v_label:
                    meta_info = simulator_engine.get_vessel_type_metadata(int(v_type))
                    v_label = meta_info.get("label", f"Type {v_type}")
                history_map[key] = {
                    "Name": name.strip(),
                    "IMO": imo.strip(),
                    "Type": int(v_type),
                    "TypeLabel": v_label,
                    "last_simulated": mod_time,
                    "runs_count": 1
                }
            else:
                history_map[key]["runs_count"] += 1

    return JSONResponse(content={"vessels": list(history_map.values())})


@app.get("/api/random_vessel")
def get_random_vessel(vessel_type: Optional[int] = Query(None)):
    """
    Generates an authentic commercial vessel identity with randomized Name,
    valid IMO (IMO9xxxxxx), Type, and default Status.
    """
    if vessel_type is None:
        vessel_type = random.choice([60, 70, 71, 80])
    
    meta = simulator_engine.get_vessel_type_metadata(vessel_type)
    
    profile = {
        "Name": simulator_engine.generate_random_name(),
        "IMO": simulator_engine.generate_random_imo(),
        "Type": vessel_type,
        "TypeLabel": meta.get("label", f"Type {vessel_type}"),
        "Status": 0,  # Under way using engine
        "TypicalCruiseSpeed": meta.get("cruise_sog", 16.5)
    }
    return JSONResponse(content=profile)


@app.post("/api/simulate")
def simulate_ais(req: SimulateRequest):
    """Executes the simulation engine and writes the strictly 10-column CSV output."""
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

    # Save to CSV strictly with 10 columns
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

    start_time = pings[0].get("DateTime") if pings else None
    end_time = pings[-1].get("DateTime") if pings else None

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
        "start_time": start_time,
        "end_time": end_time,
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
            "start_time": start_time,
            "end_time": end_time,
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

        meta_file = cf.replace(".csv", ".meta.json")
        meta = {}
        if os.path.exists(meta_file):
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                pass

        vp = meta.get("vessel_profile", {})
        vessel_name = vp.get("Name") or vp.get("VesselName") or fname
        vessel_imo = vp.get("IMO", "-")
        vessel_type = vp.get("Type") or vp.get("VesselType") or "-"
        start_time = meta.get("start_time") or "-"
        end_time = meta.get("end_time") or "-"

        # Fallback reading if meta is missing
        if not meta:
            try:
                with open(cf, "r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    first_row = next(reader, None)
                    if first_row:
                        vessel_name = first_row.get("Name") or first_row.get("VesselName") or fname
                        vessel_imo = first_row.get("IMO", "-")
                        vessel_type = first_row.get("Type") or first_row.get("VesselType") or "-"
                        start_time = first_row.get("DateTime") or first_row.get("BaseDateTime") or "-"
            except Exception:
                pass

        runs.append({
            "filename": fname,
            "modified_at": mtime,
            "size_kb": size_kb,
            "vessel_name": vessel_name,
            "imo": vessel_imo,
            "vessel_type": vessel_type,
            "ping_count": meta.get("ping_count", 0),
            "total_nm": meta.get("total_nm", 0),
            "start_time": start_time,
            "end_time": end_time
        })

    return JSONResponse(content=runs)


@app.get("/api/runs/{filename}")
def get_run_details(filename: str):
    """Retrieves full telemetry pings and metadata for a specific saved run."""
    clean_name = os.path.basename(filename)
    csv_path = os.path.join(OUTPUT_DIR, clean_name)
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="Run not found.")

    pings = []
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dt = row.get("DateTime") or row.get("BaseDateTime", "")
            name = row.get("Name") or row.get("VesselName", "")
            v_type = int(row.get("Type") or row.get("VesselType") or 0)
            imo = row.get("IMO", "")
            status = int(row.get("Status") or 0)
            
            pings.append({
                "DateTime": dt,
                "BaseDateTime": dt,  # Backwards compatibility for older viewers
                "LAT": float(row.get("LAT", 0.0)),
                "LON": float(row.get("LON", 0.0)),
                "SOG": float(row.get("SOG", 0.0)),
                "COG": float(row.get("COG", 0.0)),
                "Heading": float(row.get("Heading", 0.0)),
                "Name": name,
                "VesselName": name,  # Backwards compatibility
                "IMO": imo,
                "Type": v_type,
                "VesselType": v_type,  # Backwards compatibility
                "Status": status
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


# Serve Ports Visualizer standalone page
@app.get("/ports-visualizer")
def serve_ports_visualizer():
    vis_path = os.path.join(BASE_DIR, "specs", "001-simplified-telemetry-and-vessel-picker", "ports_visualizer.html")
    if os.path.exists(vis_path):
        return FileResponse(vis_path)
    raise HTTPException(status_code=404, detail="Visualizer not found.")


@app.get("/specs/001-simplified-telemetry-and-vessel-picker/asia_ports.js")
def serve_asia_ports_js():
    js_path = os.path.join(BASE_DIR, "specs", "001-simplified-telemetry-and-vessel-picker", "asia_ports.js")
    if os.path.exists(js_path):
        return FileResponse(js_path, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="Data file not found.")


# Mount Static Assets & Pages
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
    port = 8765
    print(f"Starting AIS Simulator Server on http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
