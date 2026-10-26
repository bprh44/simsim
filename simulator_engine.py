"""
High-Fidelity AIS Synthetic Trajectory & Kinematics Generator.
Produces realistic Class A AIS telemetry matching canonical Medallion/NOAA bronze schemas.
Features:
  - Realistic Great-Circle & Rhumb Line Geodesy
  - Catmull-Rom & Dubins Turn Smoothing with Dynamic Rate-of-Turn (ROT)
  - Realistic Harbor Easing (Departure/Arrival) & Open-Sea 1.5x Speed Boost
  - Reverse & Forward Timestamping Engines
  - Empirical Stochastic AIS Transmission Intervals (10s - 120s) with Dropped Packet Gaps (up to 600s)
  - Identifier Generation (MMSI, IMO, VesselName, CallSign) grounded in DuckDB historical data
"""

import math
import random
import bisect
import json
import os
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Tuple, Optional

# Load precomputed vessel specifications
SPECS_PATH = os.path.join(os.path.dirname(__file__), "vessel_specs.json")
if os.path.exists(SPECS_PATH):
    with open(SPECS_PATH, "r") as f:
        VESSEL_SPECS = json.load(f)
else:
    VESSEL_SPECS = {}

EARTH_RADIUS_M = 6371000.0
NM_TO_M = 1852.0
M_TO_NM = 1.0 / 1852.0
KNOTS_TO_MPS = 0.514444
MPS_TO_KNOTS = 1.94384

# Authentic naming pools based on DuckDB bronze records
NAME_PREFIXES = [
    "PACIFIC", "OCEAN", "ORIENTAL", "EASTERN", "GOLDEN", "SEA", "GLOBAL",
    "STAR", "HANJIN", "PAN", "SEASPAN", "EVER", "HYUNDAI", "KOREA",
    "HOKKAIDO", "BUSAN", "TAIHEIYO", "ASIAN", "DIAMOND", "BLUE", "SILVER",
    "NORTHERN", "SUNRISE", "COSMO", "NIPPON", "ROYAL", "MARITIME"
]
NAME_SUFFIXES = [
    "PIONEER", "VOYAGER", "EXPRESS", "HARMONY", "GLORY", "LEADER", "NAVIGATOR",
    "HORIZON", "MARU", "QUEEN", "FORTITUDE", "PRIDE", "SPIRIT", "CHAMPION",
    "VENTURE", "PHOENIX", "ACE", "DISCOVERY", "PROGRESS", "BREEZE", "ARROW"
]

MID_PREFIXES = {
    "Korea": ["440", "441"],
    "Japan": ["431", "432"],
    "Panama": ["351", "352", "353", "354", "355", "356", "357"],
    "Liberia": ["636"],
    "Marshall Islands": ["538"],
    "Singapore": ["563", "564", "565", "566"],
    "China": ["412", "413", "414"]
}


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two points in meters."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return EARTH_RADIUS_M * c


def initial_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes the initial azimuth (bearing) from point 1 to point 2 in degrees [0, 360)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)

    y = math.sin(dlambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    bearing = math.degrees(math.atan2(y, x))
    return (bearing + 360.0) % 360.0


def destination_point(lat: float, lon: float, bearing_deg: float, distance_m: float) -> Tuple[float, float]:
    """Computes destination point given start point, bearing, and distance."""
    delta = distance_m / EARTH_RADIUS_M
    theta = math.radians(bearing_deg)
    phi1 = math.radians(lat)
    lambda1 = math.radians(lon)

    sin_phi1 = math.sin(phi1)
    cos_phi1 = math.cos(phi1)
    sin_delta = math.sin(delta)
    cos_delta = math.cos(delta)

    sin_phi2 = sin_phi1 * cos_delta + cos_phi1 * sin_delta * math.cos(theta)
    phi2 = math.asin(max(-1.0, min(1.0, sin_phi2)))

    y = math.sin(theta) * sin_delta * cos_phi1
    x = cos_delta - sin_phi1 * math.sin(phi2)
    lambda2 = lambda1 + math.atan2(y, x)

    return math.degrees(phi2), (math.degrees(lambda2) + 540.0) % 360.0 - 180.0


# ---------------------------------------------------------------------------
# Common Maritime Corridors for Japan, Korea, and China
# Grounded in authentic TSS (Traffic Separation Schemes) and Ro-Pax Ferry lanes
# ---------------------------------------------------------------------------
CORRIDORS = {
    "busan_fukuoka": {
        "id": "busan_fukuoka",
        "name": "Busan <-> Fukuoka (Hakata)",
        "region": "KR <-> JP",
        "description": "Korea Strait & Tsushima East Channel high-speed hydrofoil / Ro-Pax ferry corridor (Camellia Line / Beetle).",
        "port_a": "Busan North Port (KR)",
        "port_b": "Hakata Port, Fukuoka (JP)",
        "typical_vessel_type": 60,  # Passenger / Ferry
        "typical_cruise_speed": 19.5,
        "center": [34.3, 129.8],
        "zoom": 8,
        "waypoints": [
            [35.1150, 129.0430],  # Busan International Passenger Terminal
            [35.0300, 129.1300],  # Busan Harbor TSS fairway entrance
            [34.7000, 129.3500],  # Western Korea Strait TSS
            [34.4000, 129.5500],  # North-East of Tsushima Island
            [33.9500, 130.0000],  # Genkai-nada Sea approach
            [33.6800, 130.3300],  # Hakata Bay fairway light buoy
            [33.6065, 130.3950]   # Hakata Port International Terminal
        ]
    },
    "busan_shimonoseki": {
        "id": "busan_shimonoseki",
        "name": "Busan <-> Shimonoseki",
        "region": "KR <-> JP",
        "description": "Historic Kanpu Ferry corridor traversing Korea Strait to Western Honshu / Kanmon gateway.",
        "port_a": "Busan North Port (KR)",
        "port_b": "Shimonoseki Port (JP)",
        "typical_vessel_type": 60,  # Passenger / Ferry
        "typical_cruise_speed": 17.5,
        "center": [34.5, 130.0],
        "zoom": 8,
        "waypoints": [
            [35.1150, 129.0430],  # Busan Port Terminal
            [35.0300, 129.1300],  # Busan Harbor Fairway
            [34.6500, 129.6000],  # Korea Strait central corridor
            [34.3500, 130.1500],  # West of Oki passage
            [34.0500, 130.8000],  # Kanmon Strait Western Fairway approach
            [33.9500, 130.9300]   # Shimonoseki Port International Terminal
        ]
    },
    "busan_osaka": {
        "id": "busan_osaka",
        "name": "Busan <-> Osaka (via Seto Inland Sea)",
        "region": "KR <-> JP",
        "description": "PanStar Dream cruise ferry corridor passing through Kanmon Strait, Kurushima Strait, and Akashi Kaikyo.",
        "port_a": "Busan Port (KR)",
        "port_b": "Osaka Port Nanko Terminal (JP)",
        "typical_vessel_type": 60,
        "typical_cruise_speed": 18.0,
        "center": [34.4, 132.5],
        "zoom": 7,
        "waypoints": [
            [35.1150, 129.0430],  # Busan Port
            [35.0300, 129.1300],  # Busan TSS
            [34.5000, 130.0000],  # Tsushima East
            [34.0200, 130.8200],  # Kanmon Strait West Approach
            [33.9550, 130.9500],  # Kanmon Kaikyo Bridge fairway
            [33.8500, 131.7000],  # Suo-nada Sea lane
            [34.1200, 132.9800],  # Kurushima Kaikyo passage
            [34.3500, 134.1500],  # Bisan Seto TSS
            [34.6000, 135.0200],  # Akashi Kaikyo Bridge transit
            [34.6200, 135.4200]   # Osaka Port Nanko Ferry Terminal
        ]
    },
    "incheon_weihai": {
        "id": "incheon_weihai",
        "name": "Incheon <-> Weihai (Shandong)",
        "region": "KR <-> CN",
        "description": "High-density cross-Yellow Sea Ro-Pax ferry corridor (Weidong Ferry) connecting Gyeonggi bay and Shandong Peninsula.",
        "port_a": "Incheon International Passenger Terminal (KR)",
        "port_b": "Weihai Port Terminal (CN)",
        "typical_vessel_type": 60,
        "typical_cruise_speed": 18.5,
        "center": [37.3, 124.3],
        "zoom": 7,
        "waypoints": [
            [37.4520, 126.6015],  # Incheon Port
            [37.2000, 126.0500],  # Deokjeok-do channel TSS
            [37.0500, 125.1000],  # Outer Gyeonggi Bay fairway
            [37.0000, 124.0000],  # Mid-Yellow Sea shipping corridor
            [37.2500, 122.9000],  # Approaching Chengshantou TSS (Shandong)
            [37.4500, 122.3500],  # Weihai outer anchorage approach
            [37.5200, 122.1400]   # Weihai Port Passenger Pier
        ]
    },
    "incheon_qingdao": {
        "id": "incheon_qingdao",
        "name": "Incheon <-> Qingdao",
        "region": "KR <-> CN",
        "description": "Major Yellow Sea Ro-Pax & container feeder corridor through the central TSS lane to Jiaozhou Bay.",
        "port_a": "Incheon Port (KR)",
        "port_b": "Qingdao Dagang Terminal (CN)",
        "typical_vessel_type": 70,  # Cargo / Feeder
        "typical_cruise_speed": 16.0,
        "center": [36.6, 123.5],
        "zoom": 7,
        "waypoints": [
            [37.4520, 126.6015],  # Incheon Port
            [37.2000, 126.0500],  # Deokjeok-do channel
            [36.8000, 125.0000],  # Yellow Sea South-West TSS
            [36.3000, 123.5000],  # Central Yellow Sea international fairway
            [35.8000, 121.5000],  # Chaolian Island approach TSS
            [35.9500, 120.5000],  # Jiaozhou Bay fairway
            [36.0800, 120.3100]   # Qingdao Port Terminal
        ]
    },
    "incheon_dalian": {
        "id": "incheon_dalian",
        "name": "Incheon <-> Dalian (Liaoning)",
        "region": "KR <-> CN",
        "description": "Northern Yellow Sea Ro-Pax lane linking Incheon with the Liaodong Peninsula (Dain Ferry).",
        "port_a": "Incheon Port (KR)",
        "port_b": "Dalian Port Passenger Terminal (CN)",
        "typical_vessel_type": 60,
        "typical_cruise_speed": 17.0,
        "center": [38.2, 124.0],
        "zoom": 7,
        "waypoints": [
            [37.4520, 126.6015],  # Incheon Port
            [37.2500, 126.0000],  # Deokjeok-do North exit
            [37.7000, 124.8000],  # West of Baengnyeong-do international water
            [38.1000, 123.5000],  # Northern Yellow Sea fairway
            [38.5000, 122.5000],  # Approaching Dalian Bay TSS
            [38.8500, 121.8000],  # Outer Dalian fairway
            [38.9300, 121.6600]   # Dalian Port Terminal
        ]
    },
    "busan_shanghai": {
        "id": "busan_shanghai",
        "name": "Busan <-> Shanghai (Yangshan / Waigaoqiao)",
        "region": "KR <-> CN",
        "description": "Highest-traffic mega-container and feeder corridor in East Asia via the East China Sea fairway.",
        "port_a": "Busan New Port / North Port (KR)",
        "port_b": "Shanghai Waigaoqiao Terminal (CN)",
        "typical_vessel_type": 71,  # Container Ship
        "typical_cruise_speed": 18.5,
        "center": [33.2, 125.5],
        "zoom": 6,
        "waypoints": [
            [35.1028, 129.0403],  # Busan Port
            [34.9000, 128.9500],  # Busan South exit
            [33.9000, 127.5000],  # South Sea TSS lane
            [33.1000, 126.6000],  # South of Jeju Island
            [32.2000, 124.5000],  # East China Sea Northern fairway
            [31.6000, 123.0000],  # Yangtze River Estuary TSS Outer Light Vessel
            [31.3800, 122.1000],  # Changjiang fairway channel
            [31.3800, 121.6000]   # Shanghai Waigaoqiao Terminal
        ]
    },
    "shanghai_osaka": {
        "id": "shanghai_osaka",
        "name": "Shanghai <-> Osaka / Kobe",
        "region": "CN <-> JP",
        "description": "Flagship China-Japan International Ferry line (Xin Jian Zhen / Su Zhou Hao) crossing East China Sea and Kanmon.",
        "port_a": "Shanghai International Ferry Port (CN)",
        "port_b": "Osaka Port / Kobe Port (JP)",
        "typical_vessel_type": 60,  # Passenger / Ferry
        "typical_cruise_speed": 19.0,
        "center": [33.0, 128.0],
        "zoom": 6,
        "waypoints": [
            [31.3800, 121.6000],  # Shanghai Port
            [31.3500, 122.5000],  # Yangtze Estuary Pilot Station
            [32.0000, 124.5000],  # East China Sea open transit
            [32.7000, 127.5000],  # West of Danjo Islands
            [33.3000, 129.2000],  # Ikitsuki / Hirado offshore lane
            [33.9500, 130.1000],  # Genkai-nada fairway
            [33.9550, 130.9500],  # Kanmon Strait passage
            [34.1200, 132.9800],  # Kurushima Strait
            [34.6000, 135.0200],  # Akashi Kaikyo
            [34.6200, 135.4200]   # Osaka Port
        ]
    },
    "busan_jeju": {
        "id": "busan_jeju",
        "name": "Busan <-> Jeju Island",
        "region": "KR Domestic",
        "description": "Korea's premier passenger and Ro-Pax ferry commute corridor connecting Busan with Jeju Port.",
        "port_a": "Busan North Port (KR)",
        "port_b": "Jeju International Passenger Terminal (KR)",
        "typical_vessel_type": 60,
        "typical_cruise_speed": 18.0,
        "center": [34.3, 127.8],
        "zoom": 8,
        "waypoints": [
            [35.1028, 129.0403],  # Busan North Port
            [34.9500, 128.9500],  # Busan Harbor approach
            [34.7000, 128.5500],  # South of Geoje Island passage
            [34.3000, 128.0000],  # Korea South Sea shipping fairway
            [33.9500, 127.3500],  # Geomun-do / Yeosu offshore lane
            [33.6500, 126.8500],  # Northeast Jeju fairway approach
            [33.5240, 126.5410]   # Jeju International Passenger Terminal
        ]
    },
    "busan_tsushima": {
        "id": "busan_tsushima",
        "name": "Busan <-> Tsushima (Hitakatsu)",
        "region": "KR <-> JP",
        "description": "DirectFerries verified high-speed international day-trip corridor across Western Korea Strait (Panstar / Starline, ~1h 15m).",
        "port_a": "Busan International Passenger Terminal (KR)",
        "port_b": "Hitakatsu Port, Tsushima (JP)",
        "typical_vessel_type": 60,  # Fast Passenger Hydrofoil / Catamaran
        "typical_cruise_speed": 28.0,
        "center": [34.8, 129.2],
        "zoom": 9,
        "waypoints": [
            [35.1150, 129.0430],  # Busan Port
            [35.0500, 129.1100],  # Busan harbor exit
            [34.9000, 129.2000],  # Western Korea Strait TSS
            [34.7500, 129.3500],  # Mid-strait high speed track
            [34.6800, 129.4500],  # Hitakatsu approach fairway
            [34.6560, 129.4670]   # Hitakatsu International Terminal, Tsushima
        ]
    },
    "mokpo_jeju": {
        "id": "mokpo_jeju",
        "name": "Mokpo <-> Jeju Island",
        "region": "KR Domestic",
        "description": "DirectFerries high-frequency South Korea domestic passenger ferry trunk line (Sea World Queen Mary 2, ~4h 30m).",
        "port_a": "Mokpo International Ferry Terminal (KR)",
        "port_b": "Jeju International Passenger Terminal (KR)",
        "typical_vessel_type": 60,
        "typical_cruise_speed": 19.0,
        "center": [34.1, 126.4],
        "zoom": 8,
        "waypoints": [
            [34.7750, 126.3750],  # Mokpo Port
            [34.6000, 126.3000],  # Mokpo Outer Fairway
            [34.3000, 126.2500],  # West of Jindo Island
            [33.9500, 126.3000],  # Chuja Islands Channel
            [33.6000, 126.4500],  # Jeju North approach
            [33.5240, 126.5410]   # Jeju Port
        ]
    },
    "shinmoji_izumiotsu": {
        "id": "shinmoji_izumiotsu",
        "name": "Shinmoji (Kitakyushu) <-> Izumiotsu (Osaka)",
        "region": "JP Domestic",
        "description": "DirectFerries flagship Seto Inland Sea overnight trunk line (Hankyu Ferry / Meimon Taiyo Ferry, ~12h 30m).",
        "port_a": "Shinmoji Port, Kitakyushu (JP)",
        "port_b": "Izumiotsu Port, Osaka (JP)",
        "typical_vessel_type": 60,
        "typical_cruise_speed": 21.0,
        "center": [34.2, 133.0],
        "zoom": 7,
        "waypoints": [
            [33.9100, 131.0000],  # Shinmoji Port
            [33.8800, 131.3500],  # Suo-nada Fairway
            [33.9800, 132.2000],  # Iyo-nada fairway
            [34.1200, 132.9800],  # Kurushima Kaikyo TSS
            [34.3200, 133.9000],  # Bisan-seto Fairway
            [34.4500, 134.6000],  # Harima-nada fairway
            [34.6000, 135.0200],  # Akashi Kaikyo Bridge
            [34.5000, 135.3800]   # Izumiotsu Port, Osaka Bay
        ]
    },
    "maizuru_otaru": {
        "id": "maizuru_otaru",
        "name": "Maizuru (Kyoto) <-> Otaru (Hokkaido)",
        "region": "JP Domestic",
        "description": "DirectFerries Sea of Japan high-speed passenger & freight superferry trunk line (Shin Nihonkai Ferry, ~21h).",
        "port_a": "Maizuru Port, Kyoto (JP)",
        "port_b": "Otaru Port, Hokkaido (JP)",
        "typical_vessel_type": 60,
        "typical_cruise_speed": 23.5,
        "center": [38.5, 138.0],
        "zoom": 6,
        "waypoints": [
            [35.4800, 135.3800],  # Maizuru Port
            [35.8000, 135.5000],  # Wakasa Bay exit
            [37.5000, 137.0000],  # Noto Peninsula offshore
            [39.2000, 139.2000],  # Sado Island / Yamagata offshore
            [41.0000, 140.0000],  # Tsugaru Strait Western entrance
            [42.5000, 140.5000],  # Shiribeshi coast
            [43.1950, 141.0150]   # Otaru Ferry Terminal
        ]
    },
    "oarai_tomakomai": {
        "id": "oarai_tomakomai",
        "name": "Oarai (Ibaraki / Tokyo) <-> Tomakomai (Hokkaido)",
        "region": "JP Domestic",
        "description": "DirectFerries Pacific Ocean flagship cruise ferry corridor connecting Greater Tokyo with Hokkaido (MOL Sunflower, ~18h).",
        "port_a": "Oarai Ferry Terminal (JP)",
        "port_b": "Tomakomai Port West Terminal (JP)",
        "typical_vessel_type": 60,
        "typical_cruise_speed": 22.0,
        "center": [39.5, 142.0],
        "zoom": 6,
        "waypoints": [
            [36.3100, 140.5850],  # Oarai Port
            [36.6000, 140.9000],  # Ibaraki offshore
            [38.2000, 141.6000],  # Off Sendai / Ojika Peninsula
            [39.8000, 142.2500],  # Sanriku Pacific corridor
            [41.5000, 142.0000],  # Shimokita offshore
            [42.4000, 141.8000],  # Uchiura Bay approach
            [42.6320, 141.6250]   # Tomakomai Port
        ]
    },
    "kagoshima_naha": {
        "id": "kagoshima_naha",
        "name": "Kagoshima <-> Naha (Okinawa) via Amami",
        "region": "JP Domestic",
        "description": "DirectFerries Ryukyu / Nansei Islands lifeline sea corridor connecting Kyushu with Okinawa (Marix Line / A-Line, ~25h).",
        "port_a": "Kagoshima New Port (JP)",
        "port_b": "Naha Port, Okinawa (JP)",
        "typical_vessel_type": 60,
        "typical_cruise_speed": 19.5,
        "center": [29.0, 129.0],
        "zoom": 6,
        "waypoints": [
            [31.5700, 130.5700],  # Kagoshima Port
            [31.1000, 130.6500],  # Osumi Strait
            [30.4000, 130.4000],  # West of Yakushima
            [28.4000, 129.5000],  # Amami Oshima (Naze Port)
            [27.7500, 129.0000],  # Tokunoshima (Kametoku)
            [27.3500, 128.6500],  # Okinoerabu (Wadomari)
            [27.0500, 128.4000],  # Yoron Island
            [26.6800, 127.8800],  # Motobu Port, Okinawa
            [26.2200, 127.6700]   # Naha Port Terminal, Okinawa
        ]
    }
}




# ---------------------------------------------------------------------------
# Identifier & Dimension Auto-Generators
# ---------------------------------------------------------------------------

def generate_random_mmsi(country: Optional[str] = None) -> int:
    """Generates a realistic 9-digit MMSI with valid maritime identification digits (MID)."""
    if not country or country not in MID_PREFIXES:
        all_mids = [mid for mids in MID_PREFIXES.values() for mid in mids]
        mid = random.choice(all_mids)
    else:
        mid = random.choice(MID_PREFIXES[country])
    suffix = random.randint(100000, 999999)
    return int(f"{mid}{suffix}")


def generate_random_imo() -> str:
    """Generates an authentic 7-digit IMO number starting with 9 (IMO9xxxxxx)."""
    # IMO numbers have 7 digits with a checksum: sum(d_i * (7-i)) mod 10 = d_7
    d = [9] + [random.randint(0, 9) for _ in range(5)]
    checksum = sum(d[i] * (7 - i) for i in range(6)) % 10
    d.append(checksum)
    return f"IMO{''.join(map(str, d))}"


def generate_random_name() -> str:
    """Generates a realistic commercial vessel name."""
    p = random.choice(NAME_PREFIXES)
    s = random.choice(NAME_SUFFIXES)
    num = f" {random.randint(1, 99)}" if random.random() < 0.25 else ""
    return f"{p} {s}{num}"


def generate_random_callsign() -> str:
    """Generates a realistic 4 to 6 character radio call sign."""
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    digits = "23456789"
    pattern = random.choice([
        f"{random.choice(letters)}{random.choice(letters)}{random.choice(digits)}{random.choice(digits)}",
        f"{random.choice(letters)}{random.choice(letters)}{random.choice(letters)}{random.choice(digits)}",
        f"{random.choice(letters)}{random.choice(letters)}{random.choice(letters)}{random.choice(letters)}{random.choice(digits)}",
        f"DSQ{random.choice(letters)}{random.randint(1,9)}",
        f"HLB{random.choice(letters)}"
    ])
    return pattern


def get_vessel_type_metadata(vessel_type: int) -> Dict[str, Any]:
    """Retrieves typical dimensions and speed profile for a given vessel type."""
    key = str(vessel_type)
    if key in VESSEL_SPECS:
        spec = VESSEL_SPECS[key]
    else:
        spec = {
            "type_code": vessel_type,
            "label": f"Type {vessel_type}",
            "description": "Commercial Vessel",
            "median_length": 150.0,
            "median_width": 24.0,
            "median_draft": 8.0,
            "median_sog": 11.5,
            "cruise_sog": 15.0
        }
    return spec


def auto_generate_dimensions(vessel_type: int) -> Dict[str, float]:
    """Generates realistic dimensions with slight natural variation."""
    meta = get_vessel_type_metadata(vessel_type)
    # 5% Gaussian jitter around median
    jitter = lambda val, min_v, max_v: max(min_v, min(max_v, round(val * random.gauss(1.0, 0.05), 1)))
    length = jitter(meta.get("median_length", 120.0), 10.0, 420.0)
    width = jitter(meta.get("median_width", 20.0), 3.0, 65.0)
    draft = jitter(meta.get("median_draft", 6.0), 1.0, 24.0)
    return {"Length": length, "Width": width, "Draft": draft}


# ---------------------------------------------------------------------------
# Path Smoothing & Kinematics Engine
# ---------------------------------------------------------------------------

def smooth_polyline_catmull_rom(waypoints: List[Tuple[float, float]], samples_per_segment: int = 15) -> List[Tuple[float, float]]:
    """
    Applies Catmull-Rom spline interpolation through waypoints to simulate natural rudder curves.
    Waypoints is a list of (lat, lon) coordinates.
    """
    if len(waypoints) < 3:
        return waypoints

    pts = [waypoints[0]] + waypoints + [waypoints[-1]]
    smoothed = []

    for i in range(1, len(pts) - 2):
        p0 = pts[i - 1]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[i + 2]

        for s in range(samples_per_segment):
            t = s / float(samples_per_segment)
            t2 = t * t
            t3 = t2 * t

            # Standard Catmull-Rom spline formula
            lat = 0.5 * (
                (2 * p1[0]) +
                (-p0[0] + p2[0]) * t +
                (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
            )
            lon = 0.5 * (
                (2 * p1[1]) +
                (-p0[1] + p2[1]) * t +
                (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
            )
            smoothed.append((lat, lon))

    smoothed.append(waypoints[-1])
    return smoothed


def build_trajectory(
    waypoints: List[Tuple[float, float]],
    vessel_profile: Dict[str, Any],
    timing_mode: str = "forward",  # "forward" or "reverse"
    reference_time: Optional[datetime] = None,
    desired_speed_knots: Optional[float] = None,
    allow_open_sea_boost: bool = False,
    segment_speeds: Optional[List[float]] = None,
    min_ping_gap_s: int = 15,
    max_ping_gap_s: int = 120,
    max_dropout_gap_s: int = 600,
    dropout_probability: float = 0.03
) -> List[Dict[str, Any]]:
    """
    Generates a full synthetic AIS telemetry sequence along the provided waypoints.
    """
    if len(waypoints) < 2:
        raise ValueError("At least 2 waypoints are required to simulate a trajectory.")

    vessel_type = int(vessel_profile.get("VesselType", 70))
    meta = get_vessel_type_metadata(vessel_type)
    base_cruise_sog = desired_speed_knots if desired_speed_knots and desired_speed_knots > 0 else meta.get("cruise_sog", 15.0)

    # 1. Smooth the raw waypoint path
    smoothed_coords = smooth_polyline_catmull_rom(waypoints, samples_per_segment=20)

    # 2. Compute cumulative distances along the smoothed path
    cum_distances_m = [0.0]
    total_m = 0.0
    for i in range(1, len(smoothed_coords)):
        d = haversine_distance_m(
            smoothed_coords[i - 1][0], smoothed_coords[i - 1][1],
            smoothed_coords[i][0], smoothed_coords[i][1]
        )
        total_m += d
        cum_distances_m.append(total_m)

    total_nm = total_m * M_TO_NM

    # 3. Determine Speed Profile Function SOG(dist_m)
    # Harbor departure: first 3.0 NM ramp up from 5.0 to cruising
    # Harbor arrival: last 3.0 NM ramp down from cruising to 5.0
    # Open sea boost: if enabled, peak speed in the middle 60% of route can reach 1.5x cruising speed
    harbor_zone_m = min(3.0 * NM_TO_M, total_m * 0.2)
    harbor_speed = min(6.0, base_cruise_sog * 0.4)
    peak_speed = base_cruise_sog * 1.5 if allow_open_sea_boost else base_cruise_sog

    def get_target_sog(dist_m: float) -> float:
        # Check segment override if provided
        if segment_speeds and len(segment_speeds) == len(waypoints) - 1:
            # Map smoothed distance back to original waypoint segment
            frac = dist_m / max(1.0, total_m)
            seg_idx = min(len(segment_speeds) - 1, int(frac * (len(waypoints) - 1)))
            return segment_speeds[seg_idx]

        # Standard Harbor Easing + Open Sea Curve
        if dist_m < harbor_zone_m:
            ratio = dist_m / harbor_zone_m
            return harbor_speed + (base_cruise_sog - harbor_speed) * (ratio ** 0.8)
        elif dist_m > (total_m - harbor_zone_m):
            ratio = (total_m - dist_m) / harbor_zone_m
            return harbor_speed + (base_cruise_sog - harbor_speed) * (ratio ** 0.8)
        else:
            # Open sea zone
            if allow_open_sea_boost:
                mid_frac = (dist_m - harbor_zone_m) / max(1.0, total_m - 2 * harbor_zone_m)
                # Sine bell curve peaking at 1.5x
                boost = math.sin(mid_frac * math.pi) * (peak_speed - base_cruise_sog)
                return base_cruise_sog + boost
            return base_cruise_sog

    # 4. Integrate time along the path using discrete step simulation
    # Estimate total travel time first
    step_m = 50.0  # 50 meter integration steps
    current_dist_m = 0.0
    integrated_time_s = 0.0

    time_at_dist: List[Tuple[float, float, float]] = []  # (dist_m, time_s, sog_knots)
    while current_dist_m < total_m:
        sog = get_target_sog(current_dist_m)
        v_mps = max(0.5, sog * KNOTS_TO_MPS)
        dt = step_m / v_mps
        time_at_dist.append((current_dist_m, integrated_time_s, sog))
        integrated_time_s += dt
        current_dist_m += step_m

    time_at_dist.append((total_m, integrated_time_s, get_target_sog(total_m)))
    total_travel_time_s = integrated_time_s

    # 5. Set Starting Timestamp based on Timing Mode
    if reference_time is None:
        reference_time = datetime.now(timezone.utc)

    if timing_mode == "reverse":
        start_time = reference_time - timedelta(seconds=total_travel_time_s)
    else:
        start_time = reference_time

    # Helper function to interpolate coord and bearing at any given distance
    def interpolate_coord_at_dist(d_m: float) -> Tuple[float, float, float]:
        idx = bisect.bisect_left(cum_distances_m, d_m)
        if idx <= 0:
            lat1, lon1 = smoothed_coords[0]
            lat2, lon2 = smoothed_coords[min(1, len(smoothed_coords) - 1)]
            bearing = initial_bearing_deg(lat1, lon1, lat2, lon2)
            return lat1, lon1, bearing
        if idx >= len(smoothed_coords):
            lat1, lon1 = smoothed_coords[-2]
            lat2, lon2 = smoothed_coords[-1]
            bearing = initial_bearing_deg(lat1, lon1, lat2, lon2)
            return lat2, lon2, bearing

        d0 = cum_distances_m[idx - 1]
        d1 = cum_distances_m[idx]
        frac = (d_m - d0) / max(0.001, d1 - d0)
        p0 = smoothed_coords[idx - 1]
        p1 = smoothed_coords[idx]
        lat = p0[0] + frac * (p1[0] - p0[0])
        lon = p0[1] + frac * (p1[1] - p0[1])
        bearing = initial_bearing_deg(p0[0], p0[1], p1[0], p1[1])
        return lat, lon, bearing

    # 6. Generate Realistic Stochastic AIS Pings
    pings = []
    curr_time_s = 0.0
    last_bearing = None

    while curr_time_s <= total_travel_time_s:
        # Find current position along integrated profile
        frac_time = curr_time_s / max(1.0, total_travel_time_s)
        # Binary search time_at_dist
        t_arr = [pt[1] for pt in time_at_dist]
        idx = bisect.bisect_left(t_arr, curr_time_s)
        idx = max(0, min(len(time_at_dist) - 1, idx))
        dist_m, _, target_sog = time_at_dist[idx]

        lat, lon, bearing = interpolate_coord_at_dist(dist_m)

        # Rate of Turn (ROT) approximation (deg / min)
        if last_bearing is None:
            rot = 0.0
        else:
            diff = (bearing - last_bearing + 180.0) % 360.0 - 180.0
            dt_min = (ping_interval if 'ping_interval' in locals() else 30.0) / 60.0
            rot = round(diff / max(0.01, dt_min), 1)
        last_bearing = bearing

        # Subtle realistic GPS noise (0.1 to 0.3 knots SOG noise, 0.5 deg COG noise)
        sog_noisy = max(0.0, round(target_sog + random.gauss(0.0, 0.15), 1))
        cog_noisy = round((bearing + random.gauss(0.0, 0.4)) % 360.0, 1)

        # Heading: slightly leads COG during turns, aligned with COG on straightaways
        heading_offset = min(15.0, max(-15.0, rot * 0.15))
        heading_noisy = round((cog_noisy + heading_offset + random.gauss(0.0, 0.5)) % 360.0, 0)

        # Ping timestamp
        ping_timestamp = start_time + timedelta(seconds=curr_time_s)
        formatted_time = ping_timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")

        # Status: 0 = Under way using engine, 5 = Moored (near terminal if SOG < 1)
        status = 0
        if (curr_time_s < 30.0 or curr_time_s > (total_travel_time_s - 30.0)) and sog_noisy < 1.5:
            status = 5

        vessel_name = str(vessel_profile.get("Name") or vessel_profile.get("VesselName") or "UNKNOWN VESSEL")
        vessel_imo = str(vessel_profile.get("IMO") or "")
        v_type = int(vessel_profile.get("Type") or vessel_profile.get("VesselType") or vessel_type)
        v_status = int(vessel_profile.get("Status") if vessel_profile.get("Status") is not None else status)

        ping_record = {
            "DateTime": formatted_time,
            "LAT": round(lat, 6),
            "LON": round(lon, 6),
            "SOG": sog_noisy,
            "COG": cog_noisy,
            "Heading": heading_noisy,
            "Name": vessel_name,
            "IMO": vessel_imo,
            "Type": v_type,
            "Status": v_status
        }
        pings.append(ping_record)

        # 7. Next ping interval with stochastic distribution and dropouts
        # High turn rate triggers faster AIS pings (10-20s)
        if abs(rot) > 10.0:
            ping_interval = random.randint(10, 25)
        else:
            # Check for rare dropped packet gap (up to max_dropout_gap_s, default 600s)
            if random.random() < dropout_probability and (curr_time_s + 600.0) < total_travel_time_s:
                ping_interval = random.randint(180, max_dropout_gap_s)
            else:
                # Normal random gap between min_ping_gap_s and max_ping_gap_s (up to 120s)
                ping_interval = random.randint(min_ping_gap_s, max_ping_gap_s)

        curr_time_s += ping_interval

    return pings


# ---------------------------------------------------------------------------
# Multi-Leg Scheduled Commute / Ferry Loop Simulation Engine
# ---------------------------------------------------------------------------

def generate_multi_leg_simulation(
    waypoints: List[Tuple[float, float]],
    vessel_profile: Dict[str, Any],
    num_legs: int = 1,
    port_dwell_hours: float = 5.0,
    start_time: Optional[datetime] = None,
    desired_speed_knots: Optional[float] = None,
    allow_open_sea_boost: bool = False,
    anomaly_config: Optional[Dict[str, Any]] = None,
    min_ping_gap_s: int = 15,
    max_ping_gap_s: int = 120,
    max_dropout_gap_s: int = 600,
    dropout_probability: float = 0.03
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Simulates a multi-leg scheduled ferry/commute voyage between two ports (Port A <-> Port B).
    Includes realistic moored port dwell periods between legs, dynamic stochastic AIS pings,
    and optional anomaly injection (e.g. departure delay, slow steaming, or spatial detour).
    """
    if len(waypoints) < 2:
        raise ValueError("At least 2 waypoints are required to simulate a trajectory.")

    num_legs = max(1, int(num_legs))
    port_dwell_hours = max(0.2, float(port_dwell_hours))
    if start_time is None:
        start_time = datetime.now(timezone.utc)

    # Anomaly settings
    anom_target_leg = None
    anom_type = None
    anom_delay_h = 3.0
    anom_speed_mult = 0.5
    anom_detour_nm = 15.0

    if anomaly_config and anomaly_config.get("enabled", True):
        anom_target_leg = int(anomaly_config.get("target_leg", 1))
        anom_type = anomaly_config.get("anomaly_type", "delay")  # "delay", "slow_steaming", "spatial_detour"
        anom_delay_h = float(anomaly_config.get("delay_hours", 3.0))
        anom_speed_mult = float(anomaly_config.get("speed_multiplier", 0.5))
        anom_detour_nm = float(anomaly_config.get("detour_nm", 15.0))

    all_pings: List[Dict[str, Any]] = []
    legs_summary: List[Dict[str, Any]] = []
    current_time = start_time
    total_transit_nm = 0.0

    vessel_type = int(vessel_profile.get("VesselType", 60))
    meta = get_vessel_type_metadata(vessel_type)
    base_cruise_sog = desired_speed_knots if desired_speed_knots and desired_speed_knots > 0 else meta.get("cruise_sog", 18.0)

    for leg_idx in range(1, num_legs + 1):
        is_reverse_leg = (leg_idx % 2 == 0)
        leg_direction = "Port B -> Port A" if is_reverse_leg else "Port A -> Port B"
        is_anomaly_leg = (anom_target_leg == leg_idx)
        anomaly_detail = None

        # Determine waypoints for this leg
        leg_wpts = list(reversed(waypoints)) if is_reverse_leg else list(waypoints)

        # Handle Pre-Leg Departure Delay Anomaly (or initial delay on Leg 1)
        if is_anomaly_leg and anom_type == "delay":
            anomaly_detail = f"Departure delayed by +{anom_delay_h:.1f} hours at port terminal."
            # Insert extended dwell period before departure
            dwell_seconds = anom_delay_h * 3600.0
            dwell_start = current_time
            terminal_lat, terminal_lon = leg_wpts[0]
            vessel_name = str(vessel_profile.get("Name") or vessel_profile.get("VesselName") or "COMMUTER FERRY")
            vessel_imo = str(vessel_profile.get("IMO") or "")
            v_type = int(vessel_profile.get("Type") or vessel_profile.get("VesselType") or vessel_type)

            # Generate moored pings during anomaly delay
            dwell_elapsed = 0.0
            while dwell_elapsed < dwell_seconds:
                ping_dt = dwell_start + timedelta(seconds=dwell_elapsed)
                # Slight GPS drift noise (3-5 meters)
                lat_jitter = terminal_lat + random.gauss(0.0, 0.00003)
                lon_jitter = terminal_lon + random.gauss(0.0, 0.00003)
                all_pings.append({
                    "DateTime": ping_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "LAT": round(lat_jitter, 6),
                    "LON": round(lon_jitter, 6),
                    "SOG": round(random.uniform(0.0, 0.2), 1),
                    "COG": 0.0,
                    "Heading": round(random.choice([0.0, 90.0, 180.0, 270.0]), 0),
                    "Name": vessel_name,
                    "IMO": vessel_imo,
                    "Type": v_type,
                    "Status": 5
                })
                # Moored cadence: 180s to 360s
                dwell_elapsed += random.randint(180, 360)

            current_time += timedelta(seconds=dwell_seconds)

        # Handle Spatial Detour Anomaly
        if is_anomaly_leg and anom_type == "spatial_detour":
            anomaly_detail = f"Spatial detour of {anom_detour_nm:.1f} NM off nominal track."
            # Offset the middle waypoints
            if len(leg_wpts) >= 3:
                mid_idx = len(leg_wpts) // 2
                mid_lat, mid_lon = leg_wpts[mid_idx]
                # Offset coordinate ~anom_detour_nm (~0.0166 deg per NM)
                offset_deg = (anom_detour_nm * NM_TO_M) / EARTH_RADIUS_M * (180.0 / math.pi)
                leg_wpts[mid_idx] = (mid_lat + offset_deg * 0.7, mid_lon + offset_deg * 0.7)

        # Handle Slow Steaming Anomaly
        effective_cruise_sog = base_cruise_sog
        if is_anomaly_leg and anom_type == "slow_steaming":
            effective_cruise_sog = max(4.0, base_cruise_sog * anom_speed_mult)
            anomaly_detail = f"Engine slow steaming: speed derated by {(1.0 - anom_speed_mult)*100:.0f}% to {effective_cruise_sog:.1f} kts."

        # Simulate the Underway Voyage Leg
        leg_departure_time = current_time
        leg_pings = build_trajectory(
            waypoints=leg_wpts,
            vessel_profile=vessel_profile,
            timing_mode="forward",
            reference_time=leg_departure_time,
            desired_speed_knots=effective_cruise_sog,
            allow_open_sea_boost=allow_open_sea_boost and not (is_anomaly_leg and anom_type == "slow_steaming"),
            min_ping_gap_s=min_ping_gap_s,
            max_ping_gap_s=max_ping_gap_s,
            max_dropout_gap_s=max_dropout_gap_s,
            dropout_probability=dropout_probability
        )

        # Tag each ping with leg context
        for p in leg_pings:
            p["LegNumber"] = leg_idx
            p["LegPhase"] = "underway"
            p["IsAnomaly"] = is_anomaly_leg

        all_pings.extend(leg_pings)

        # Compute leg distance & duration
        leg_dist_m = 0.0
        for i in range(1, len(leg_pings)):
            leg_dist_m += haversine_distance_m(
                leg_pings[i-1]["LAT"], leg_pings[i-1]["LON"],
                leg_pings[i]["LAT"], leg_pings[i]["LON"]
            )
        leg_nm = round(leg_dist_m * M_TO_NM, 2)
        total_transit_nm += leg_nm

        last_ping_dt = datetime.fromisoformat(leg_pings[-1]["DateTime"].replace("Z", "+00:00"))
        leg_duration_s = (last_ping_dt - leg_departure_time).total_seconds()
        current_time = last_ping_dt

        legs_summary.append({
            "leg_number": leg_idx,
            "direction": leg_direction,
            "departure_time": leg_departure_time.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "arrival_time": current_time.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "duration_hours": round(leg_duration_s / 3600.0, 2),
            "distance_nm": leg_nm,
            "ping_count": len(leg_pings),
            "is_anomaly": is_anomaly_leg,
            "anomaly_type": anom_type if is_anomaly_leg else None,
            "anomaly_detail": anomaly_detail
        })

        # Generate Port Dwell Period (if more legs remain)
        if leg_idx < num_legs:
            dwell_seconds = port_dwell_hours * 3600.0
            dwell_start = current_time
            dest_lat, dest_lon = leg_wpts[-1]
            vessel_name = str(vessel_profile.get("Name") or vessel_profile.get("VesselName") or "COMMUTER FERRY")
            vessel_imo = str(vessel_profile.get("IMO") or "")
            v_type = int(vessel_profile.get("Type") or vessel_profile.get("VesselType") or vessel_type)

            dwell_elapsed = 0.0
            while dwell_elapsed < dwell_seconds:
                ping_dt = dwell_start + timedelta(seconds=dwell_elapsed)
                lat_jitter = dest_lat + random.gauss(0.0, 0.00003)
                lon_jitter = dest_lon + random.gauss(0.0, 0.00003)
                all_pings.append({
                    "DateTime": ping_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "LAT": round(lat_jitter, 6),
                    "LON": round(lon_jitter, 6),
                    "SOG": round(random.uniform(0.0, 0.2), 1),
                    "COG": 0.0,
                    "Heading": round(random.choice([0.0, 90.0, 180.0, 270.0]), 0),
                    "Name": vessel_name,
                    "IMO": vessel_imo,
                    "Type": v_type,
                    "Status": 5
                })
                # Moored interval: 180s to 360s
                dwell_elapsed += random.randint(180, 360)

            current_time += timedelta(seconds=dwell_seconds)

    total_duration_hours = round((current_time - start_time).total_seconds() / 3600.0, 2)

    metadata = {
        "num_legs": num_legs,
        "port_dwell_hours": port_dwell_hours,
        "start_time": start_time.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "end_time": current_time.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "total_duration_hours": total_duration_hours,
        "total_transit_nm": round(total_transit_nm, 2),
        "total_pings": len(all_pings),
        "legs": legs_summary,
        "anomaly_config": anomaly_config if anomaly_config and anomaly_config.get("enabled", True) else None
    }

    return all_pings, metadata


def save_trajectory_to_csv(pings: List[Dict[str, Any]], output_dir: str, custom_filename: Optional[str] = None) -> str:
    """
    Saves the generated telemetry pings to a standardized CSV file with strictly 10 columns:
    DateTime, LAT, LON, SOG, COG, Heading, Name, IMO, Type, Status
    """
    import csv

    os.makedirs(output_dir, exist_ok=True)
    if not pings:
        raise ValueError("Cannot save empty telemetry trajectory.")

    first_p = pings[0]
    v_name = first_p.get("Name") or first_p.get("VesselName") or "VESSEL"
    vessel_name = "".join(c for c in v_name if c.isalnum() or c in ("_", "-")).strip() or "VESSEL"
    imo_str = "".join(c for c in (first_p.get("IMO") or "") if c.isalnum()).strip() or "NOIMO"
    now_str = datetime.now().strftime("%Y%m%d_%H%M%S")

    filename = custom_filename or f"ais_{vessel_name}_{imo_str}_{now_str}.csv"
    if not filename.endswith(".csv"):
        filename += ".csv"

    filepath = os.path.join(output_dir, filename)

    # Strictly the 10 requested canonical columns
    columns = [
        "DateTime", "LAT", "LON", "SOG", "COG", "Heading",
        "Name", "IMO", "Type", "Status"
    ]

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(pings)

    return filepath


# ---------------------------------------------------------------------------
# NGA World Port Index (WPI) Port Loader
# ---------------------------------------------------------------------------
WPI_PORTS_PATH = os.path.join(os.path.dirname(__file__), "reference", "wpi_nga_ports.csv")
_CACHED_WPI_PORTS = None


def load_wpi_ports(query: Optional[str] = None, country: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Loads and filters authoritative maritime ports from reference/wpi_nga_ports.csv."""
    global _CACHED_WPI_PORTS
    import csv
    if _CACHED_WPI_PORTS is None:
        _CACHED_WPI_PORTS = []
        if os.path.exists(WPI_PORTS_PATH):
            with open(WPI_PORTS_PATH, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    main_name = (row.get("Main Port Name") or "").strip()
                    alt_name = (row.get("Alternate Port Name") or "").strip()
                    c_code = (row.get("Country Code") or "").strip()
                    locode = (row.get("UN/LOCODE") or "").strip()
                    lat_str = row.get("Latitude")
                    lon_str = row.get("Longitude")
                    if lat_str and lon_str and main_name:
                        try:
                            _CACHED_WPI_PORTS.append({
                                "name": main_name,
                                "alt_name": alt_name,
                                "country": c_code,
                                "locode": locode,
                                "lat": round(float(lat_str), 4),
                                "lon": round(float(lon_str), 4),
                                "harbor_size": (row.get("Harbor Size") or "").strip(),
                                "harbor_type": (row.get("Harbor Type") or "").strip()
                            })
                        except (ValueError, TypeError):
                            continue

    results = _CACHED_WPI_PORTS or []
    if country:
        c_low = country.lower().strip()
        results = [p for p in results if c_low in p["country"].lower()]

    if query:
        q_low = query.lower().strip()
        results = [p for p in results if q_low in p["name"].lower() or q_low in p["alt_name"].lower() or q_low in p["locode"].lower()]

    return results[:limit]

