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
DATA_DIR = os.path.join(BASE_DIR, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
BRONZE_DIR = os.path.join(DATA_DIR, "bronze")
SILVER_DIR = os.path.join(DATA_DIR, "silver")
GOLD_DIR = os.path.join(DATA_DIR, "gold")
for _d in [OUTPUT_DIR, STATIC_DIR, DATA_DIR, RAW_DIR, BRONZE_DIR, SILVER_DIR, GOLD_DIR]:
    os.makedirs(_d, exist_ok=True)

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



def _generate_mmsi(imo: str, country: str = "Panama") -> str:
    digits = ''.join(c for c in imo if c.isdigit())
    tail = digits[-6:].zfill(6) if digits else "123456"
    c_lower = country.lower()
    if "korea" in c_lower or "kr" in c_lower:
        mid = "440"
    elif "japan" in c_lower or "jp" in c_lower:
        mid = "431"
    elif "china" in c_lower or "cn" in c_lower:
        mid = "413"
    elif "liberia" in c_lower or "lr" in c_lower:
        mid = "636"
    else:
        mid = "371" # Panama
    return f"{mid}{tail}"

@app.get("/api/fleet/positions")
def get_fleet_positions():
    """
    Returns the most current positions based on active time of all unique
    vessels in the database (scanning Gold/Silver Data Lake, output CSVs, and commercial ferry routes).
    Provides distinct attributes: vessel, imo, mmsi, type, flag, position, speed, status, kinematics.
    """
    fleet = {}
    now_dt = datetime.now()
    now_iso = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # 0. Check Gold Fleet State
    gold_fleet_file = os.path.join(GOLD_DIR, "fleet", "fleet_current_state.json")
    if os.path.exists(gold_fleet_file):
        try:
            with open(gold_fleet_file, "r", encoding="utf-8") as gfp:
                gdata = json.load(gfp)
                for v in gdata.get("vessels", []):
                    name = v.get("vessel", "Vessel").strip()
                    imo = v.get("imo", "IMO9999999").strip()
                    key = f"{name.upper()}_{imo.upper()}"
                    fleet[key] = {
                        "vessel": name,
                        "imo": imo,
                        "mmsi": v.get("mmsi") or _generate_mmsi(imo, v.get("flag", "Panama")),
                        "type": v.get("type", 60),
                        "type_label": v.get("type_label", "Ro-Pax Ferry"),
                        "flag": v.get("flag", "South Korea (KR)"),
                        "lat": round(float(v.get("lat", 35.115)), 4),
                        "lon": round(float(v.get("lon", 129.043)), 4),
                        "sog": round(float(v.get("calc_speed_kts", 0)), 1),
                        "cog": round(float(v.get("calc_heading_deg", 0)), 0),
                        "accel": round(float(v.get("calc_accel_kts_min", 0)), 2),
                        "status": v.get("status", "Underway"),
                        "corridor": v.get("corridor", "Korea Strait Transit"),
                        "destination": "Hakata Port, Fukuoka (JP)",
                        "safety_index": v.get("safety_index", 96.0),
                        "last_update": now_iso,
                        "tier": "gold",
                        "csv_file": "busan_silver.csv"
                    }
        except Exception:
            pass

    # 1. Output CSV files (highest fidelity simulated pings)
    csv_files = glob.glob(os.path.join(OUTPUT_DIR, "*.csv"))
    # Sort by modification time so latest simulated pings are prioritized
    csv_files.sort(key=os.path.getmtime, reverse=True)

    for cf in csv_files:
        fname = os.path.basename(cf)
        try:
            with open(cf, "r", encoding="utf-8-sig") as fp:
                reader = csv.DictReader(fp)
                last_row = None
                for r in reader:
                    last_row = r
                if last_row:
                    name = (last_row.get("Name") or "Vessel").strip()
                    imo = (last_row.get("IMO") or "IMO9999999").strip()
                    if not imo.startswith("IMO"):
                        imo = f"IMO{imo}"
                    key = f"{name.upper()}_{imo.upper()}"
                    
                    if key not in fleet:
                        flag = "Panama (PA)"
                        if "korea" in name.lower() or "busan" in fname.lower():
                            flag = "South Korea (KR)"
                        elif "breeze" in name.lower():
                            flag = "Liberia (LR)"

                        mmsi = _generate_mmsi(imo, flag)
                        lat = float(last_row.get("LAT", 35.115))
                        lon = float(last_row.get("LON", 129.043))
                        sog = float(last_row.get("SOG", 0))
                        cog = float(last_row.get("COG", 0))
                        status_label = "Underway using engine" if sog > 0.5 else "Moored"

                        fleet[key] = {
                            "vessel": name,
                            "imo": imo,
                            "mmsi": mmsi,
                            "type": int(float(last_row.get("Type", 60))),
                            "type_label": "Ro-Pax Ferry" if int(float(last_row.get("Type", 60))) == 60 else "Commercial Vessel",
                            "flag": flag,
                            "lat": round(lat, 4),
                            "lon": round(lon, 4),
                            "sog": round(sog, 1),
                            "cog": round(cog, 0),
                            "status": status_label,
                            "corridor": "Busan <-> Fukuoka (Hakata)" if "camellia" in name.lower() else "Korea Strait Transit",
                            "destination": "Hakata Port, Fukuoka (JP)" if cog > 90 and cog < 270 else "Busan North Port (KR)",
                            "last_update": last_row.get("DateTime", now_iso),
                            "csv_file": fname
                        }
        except Exception as e:
            pass

    # 2. Commercial routes reference
    routes_json = os.path.join(BASE_DIR, "reference", "commercial_ferry_routes.json")
    if os.path.exists(routes_json):
        try:
            with open(routes_json, "r", encoding="utf-8") as fp:
                routes = json.load(fp)
                for idx, r in enumerate(routes):
                    rv = r.get("real_vessel", {})
                    dv = r.get("dummy_vessel", {})
                    orig = r.get("origin_port", {})
                    dest = r.get("destination_port", {})
                    reg = r.get("region", "South Korea - Japan")

                    for v, is_dummy in [(rv, False), (dv, True)]:
                        if v and v.get("name") and v.get("imo"):
                            name = v.get("name").strip()
                            imo = v.get("imo").strip()
                            if not imo.startswith("IMO"):
                                imo = f"IMO{imo}"
                            key = f"{name.upper()}_{imo.upper()}"
                            if key not in fleet:
                                flag = "South Korea (KR)" if "Korea" in reg and not is_dummy else "Japan (JP)"
                                if "China" in reg:
                                    flag = "China (CN)"
                                mmsi = _generate_mmsi(imo, flag)
                                
                                # Current position: simulated progress along corridor
                                progress = ((idx * 0.23 + (0.5 if is_dummy else 0.1)) % 1.0)
                                o_lat, o_lon = orig.get("lat", 35.1), orig.get("lon", 129.0)
                                d_lat, d_lon = dest.get("lat", 33.6), dest.get("lon", 130.4)
                                
                                cur_lat = o_lat + (d_lat - o_lat) * progress
                                cur_lon = o_lon + (d_lon - o_lon) * progress
                                cruise_sog = v.get("cruise_speed_knots", 18.5)
                                is_underway = progress > 0.05 and progress < 0.95
                                
                                fleet[key] = {
                                    "vessel": name,
                                    "imo": imo,
                                    "mmsi": mmsi,
                                    "type": v.get("type_code", 60),
                                    "type_label": v.get("type_label", "Ro-Pax Ferry"),
                                    "flag": flag,
                                    "lat": round(cur_lat, 4),
                                    "lon": round(cur_lon, 4),
                                    "sog": round(cruise_sog if is_underway else 0.1, 1),
                                    "cog": round(140.0 if not is_dummy else 320.0, 0),
                                    "status": "Underway using engine" if is_underway else "Moored",
                                    "corridor": r.get("route_name", "Korea Strait Transit"),
                                    "destination": dest.get("name", "Arrival Port"),
                                    "last_update": now_iso,
                                    "csv_file": None
                                }
        except Exception as e:
            pass

    vessels_list = list(fleet.values())
    return JSONResponse(content={"total": len(vessels_list), "vessels": vessels_list})


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
        v_type = None
        v_label = None
        mod_time = datetime.fromtimestamp(os.path.getmtime(cf)).strftime("%Y-%m-%d %H:%M")

        if os.path.exists(meta_file):
            try:
                with open(meta_file, "r", encoding="utf-8") as mf:
                    meta = json.load(mf)
                    vp = meta.get("vessel_profile", {})
                    name = vp.get("Name") or vp.get("VesselName")
                    imo = vp.get("IMO")
                    v_type = vp.get("Type") or vp.get("VesselType")
                    v_label = vp.get("TypeLabel") or vp.get("VesselTypeLabel")
            except Exception:
                pass

        if not name or not imo or not v_type:
            # Fallback: inspect first 2 rows of CSV
            try:
                with open(cf, "r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    row = next(reader, None)
                    if row:
                        name = name or row.get("Name") or row.get("VesselName")
                        imo = imo or row.get("IMO")
                        if not v_type and row.get("Type"):
                            v_type = int(row.get("Type"))
            except Exception:
                pass

        if not v_type:
            v_type = 70

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
    # Scan output/ and data lake tiers
    all_files = glob.glob(os.path.join(OUTPUT_DIR, "*.csv"))
    all_files += glob.glob(os.path.join(SILVER_DIR, "*.csv"))
    all_files += glob.glob(os.path.join(BRONZE_DIR, "*.csv"))
    # Deduplicate while preserving order
    seen_fnames = set()
    csv_files = []
    for f in sorted(all_files, key=os.path.getmtime, reverse=True):
        bn = os.path.basename(f)
        if bn not in seen_fnames:
            seen_fnames.add(bn)
            csv_files.append(f)

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
    possible_paths = [
        os.path.join(OUTPUT_DIR, clean_name),
        os.path.join(SILVER_DIR, clean_name),
        os.path.join(BRONZE_DIR, clean_name),
        os.path.join(RAW_DIR, clean_name),
        os.path.join(BASE_DIR, clean_name)
    ]
    csv_path = None
    for p in possible_paths:
        if os.path.exists(p):
            csv_path = p
            break
    if not csv_path:
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
@app.get("/api/datalake/status")
def get_datalake_status():
    """Returns overview of Medallion Data Lake tiers (Raw, Bronze, Silver, Gold)."""
    def _list_files(directory):
        files = []
        if os.path.exists(directory):
            for fn in sorted(os.listdir(directory)):
                p = os.path.join(directory, fn)
                if os.path.isfile(p):
                    files.append({
                        "name": fn,
                        "size_kb": round(os.path.getsize(p) / 1024, 1),
                        "modified": datetime.fromtimestamp(os.path.getmtime(p)).strftime("%Y-%m-%d %H:%M:%S")
                    })
        return files

    return JSONResponse(content={
        "data_lake": {
            "architecture": "Medallion (Raw -> Bronze -> Silver -> Gold)",
            "tiers": {
                "raw": {
                    "description": "Pristine landing zone for untransformed external feeds and dumps",
                    "files": _list_files(RAW_DIR)
                },
                "bronze": {
                    "description": "Standardized 10-column canonical schema ingestion",
                    "files": _list_files(BRONZE_DIR)
                },
                "silver": {
                    "description": "Noise-cleansed, voyage-segmented and derived kinematics (speed, heading, accel, ROT) + H3 Res 8/7",
                    "files": _list_files(SILVER_DIR)
                },
                "gold": {
                    "description": "Curated maritime intelligence: Voyage KPIs (Distance, Avg Speed, Prior Dwell, Safety Index), 3rd-order Markov matrices, Top-3 spectrum",
                    "files": _list_files(GOLD_DIR)
                }
            }
        }
    })


@app.get("/api/datalake/voyages")
def get_datalake_voyages():
    """Returns curated Gold-tier voyage summaries including 4 key metrics."""
    summary_path = os.path.join(GOLD_DIR, "voyages_summary.json")
    if os.path.exists(summary_path):
        with open(summary_path, "r", encoding="utf-8") as f:
            return JSONResponse(content=json.load(f))
    return JSONResponse(content=[])


@app.get("/api/datalake/markov")
def get_datalake_markov():
    """Returns 3rd-order Markov transition matrices and Top-3 predictions from Gold tier."""
    top3_path = os.path.join(GOLD_DIR, "markov_models", "top3_predictions.json")
    matrix_path = os.path.join(GOLD_DIR, "markov_models", "transition_matrix_res8.json")
    top3 = json.load(open(top3_path, "r", encoding="utf-8")) if os.path.exists(top3_path) else {}
    matrix = json.load(open(matrix_path, "r", encoding="utf-8")) if os.path.exists(matrix_path) else {}
    return JSONResponse(content={"top3_predictions": top3, "transition_matrix": matrix})


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


# Mount Static Assets & Directories
SPATA_DIR = os.path.join(BASE_DIR, "spatA")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
if os.path.exists(OUTPUT_DIR):
    app.mount("/output", StaticFiles(directory=OUTPUT_DIR), name="output")
if os.path.exists(DATA_DIR):
    app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")
if os.path.exists(SPATA_DIR):
    app.mount("/spatA", StaticFiles(directory=SPATA_DIR), name="spatA")


@app.get("/")
@app.get("/index.html")
@app.get("/simulator")
def serve_index():
    index_path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse(content={"message": "AIS Simulator is running. Missing index.html."})


@app.get("/viewer")
@app.get("/viewer.html")
def serve_viewer():
    viewer_path = os.path.join(BASE_DIR, "viewer.html")
    if os.path.exists(viewer_path):
        return FileResponse(viewer_path)
    return JSONResponse(content={"message": "Viewer is running. Missing viewer.html."})


@app.get("/ports")
@app.get("/ports.html")
def serve_ports():
    ports_path = os.path.join(BASE_DIR, "ports.html")
    if os.path.exists(ports_path):
        return FileResponse(ports_path)
    return JSONResponse(content={"message": "Ports is running. Missing ports.html."})


@app.get("/analytics")
@app.get("/analytics.html")
def serve_analytics():
    analytics_path = os.path.join(BASE_DIR, "analytics.html")
    if os.path.exists(analytics_path):
        return FileResponse(analytics_path)
    return JSONResponse(content={"message": "Analytics is running. Missing analytics.html."})


@app.get("/{page_name}.html")
def serve_any_html(page_name: str):
    p = os.path.join(BASE_DIR, f"{page_name}.html")
    if os.path.exists(p):
        return FileResponse(p)
    raise HTTPException(status_code=404, detail=f"Page {page_name}.html not found")


if __name__ == "__main__":
    import uvicorn
    port = 8765
    print(f"Starting AIS Simulator Server on http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
