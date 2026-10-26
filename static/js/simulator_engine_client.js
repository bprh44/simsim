/**
 * Client-Side Synthetic AIS Route Simulation Engine.
 * Enables 100% standalone execution on GitHub Pages without requiring Python/FastAPI backend.
 * Synthesizes Class A AIS telemetry with canonical 10-column schema:
 * DateTime, LAT, LON, SOG, COG, Heading, Name, IMO, Type, Status
 */

(function (window) {
  const EARTH_RADIUS_M = 6371000.0;
  const NM_TO_M = 1852.0;
  const M_TO_NM = 1.0 / 1852.0;

  // Commercial Maritime Naming Pools
  const NAME_PREFIXES = [
    "PACIFIC", "OCEAN", "ORIENTAL", "EASTERN", "NORTHERN", "SOUTHERN",
    "GOLDEN", "SILVER", "BLUE", "GLOBAL", "MARITIME", "STAR", "SUNRISE",
    "ASIAN", "KOREA", "JAPAN", "CHINA", "EVER", "COASTAL", "ISLAND"
  ];

  const NAME_SUFFIXES = [
    "PIONEER", "VOYAGER", "EXPLORER", "LEADER", "NAVIGATOR", "HARMONY",
    "GLORY", "ENTERPRISE", "FORTUNE", "EXPRESS", "PRIDE", "PEARL",
    "BREEZE", "HORIZON", "PATHFINDER", "TRADER", "FERRY", "QUEEN"
  ];

  // Geodesy calculations
  function haversineDistanceM(lat1, lon1, lat2, lon2) {
    const phi1 = (lat1 * Math.PI) / 180.0;
    const phi2 = (lat2 * Math.PI) / 180.0;
    const dphi = ((lat2 - lat1) * Math.PI) / 180.0;
    const dlam = ((lon2 - lon1) * Math.PI) / 180.0;

    const a =
      Math.sin(dphi / 2.0) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2.0) ** 2;
    const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0.0, 1.0 - a)));
    return EARTH_RADIUS_M * c;
  }

  function initialBearingDeg(lat1, lon1, lat2, lon2) {
    const phi1 = (lat1 * Math.PI) / 180.0;
    const phi2 = (lat2 * Math.PI) / 180.0;
    const dlam = ((lon2 - lon1) * Math.PI) / 180.0;

    const y = Math.sin(dlam) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlam);
    const bearing = (Math.atan2(y, x) * 180.0) / Math.PI;
    return (bearing + 360.0) % 360.0;
  }

  // Authentic IMO Number Generator (IMO9xxxxxx with Modulo 10 Checksum)
  function generateRandomImo() {
    const d = [9];
    for (let i = 0; i < 5; i++) {
      d.push(Math.floor(Math.random() * 10));
    }
    const checksum = d.reduce((sum, val, idx) => sum + val * (7 - idx), 0) % 10;
    d.push(checksum);
    return `IMO${d.join("")}`;
  }

  function generateRandomName() {
    const p = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
    const s = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
    const num = Math.random() < 0.25 ? ` ${Math.floor(Math.random() * 99) + 1}` : "";
    return `${p} ${s}${num}`;
  }

  // Catmull-Rom Spline Interpolation for smooth maritime routes
  function catmullRomSpline(points, samplesPerSegment = 24) {
    if (points.length < 2) return points;
    if (points.length === 2) {
      const res = [];
      for (let i = 0; i <= samplesPerSegment; i++) {
        const frac = i / samplesPerSegment;
        res.push([
          points[0][0] + frac * (points[1][0] - points[0][0]),
          points[0][1] + frac * (points[1][1] - points[0][1])
        ]);
      }
      return res;
    }

    const extended = [points[0], ...points, points[points.length - 1]];
    const smoothed = [];

    for (let i = 1; i < extended.length - 2; i++) {
      const p0 = extended[i - 1];
      const p1 = extended[i];
      const p2 = extended[i + 1];
      const p3 = extended[i + 2];

      for (let j = 0; j < samplesPerSegment; j++) {
        const t = j / samplesPerSegment;
        const t2 = t * t;
        const t3 = t2 * t;

        const lat =
          0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);

        const lon =
          0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

        smoothed.push([lat, lon]);
      }
    }
    smoothed.push(points[points.length - 1]);
    return smoothed;
  }

  // Client Simulation Engine Core
  function simulateTrajectoryClient(options) {
    const waypoints = options.waypoints;
    const profile = options.vessel_profile || {};
    const cruiseSpeedKts = options.desired_speed_knots || profile.TypicalCruiseSpeed || 16.5;
    const numLegs = options.num_legs || 1;
    const dwellHours = options.port_dwell_hours || 5.0;
    const startDt = options.reference_time ? new Date(options.reference_time) : new Date();
    const allowDropouts = options.dropout_probability > 0;

    const vesselName = profile.Name || "PACIFIC GLORY 12";
    const vesselImo = profile.IMO || generateRandomImo();
    const vesselType = profile.Type || 70;
    const defaultStatus = profile.Status !== undefined ? profile.Status : 0;

    const allPings = [];
    let currentDt = new Date(startDt.getTime());

    for (let leg = 1; leg <= numLegs; leg++) {
      // Alternate direction on even legs
      const legWpts = leg % 2 === 1 ? [...waypoints] : [...waypoints].reverse();
      const smoothedPath = catmullRomSpline(legWpts, 24);

      // Compute cumulative distances
      const cumDist = [0];
      let totalDistM = 0;
      for (let i = 1; i < smoothedPath.length; i++) {
        const d = haversineDistanceM(
          smoothedPath[i - 1][0],
          smoothedPath[i - 1][1],
          smoothedPath[i][0],
          smoothedPath[i][1]
        );
        totalDistM += d;
        cumDist.push(totalDistM);
      }

      // Build speed profile with harbor easing
      const harborEaseDistM = Math.min(6000.0, totalDistM * 0.15);
      const harborSpeedKts = 6.0;

      let currentDistM = 0;
      let lastBearing = null;

      while (currentDistM <= totalDistM) {
        // Harbor acceleration / cruising / deceleration
        let targetSpeedKts = cruiseSpeedKts;
        if (currentDistM < harborEaseDistM) {
          const frac = currentDistM / harborEaseDistM;
          targetSpeedKts = harborSpeedKts + frac * (cruiseSpeedKts - harborSpeedKts);
        } else if (totalDistM - currentDistM < harborEaseDistM) {
          const frac = (totalDistM - currentDistM) / harborEaseDistM;
          targetSpeedKts = harborSpeedKts + frac * (cruiseSpeedKts - harborSpeedKts);
        }

        // Interpolate coordinate along path
        let segIdx = 0;
        while (segIdx < cumDist.length - 1 && cumDist[segIdx + 1] < currentDistM) {
          segIdx++;
        }
        const segDist = Math.max(1.0, cumDist[segIdx + 1] - cumDist[segIdx]);
        const frac = Math.min(1.0, Math.max(0.0, (currentDistM - cumDist[segIdx]) / segDist));

        const p0 = smoothedPath[segIdx];
        const p1 = smoothedPath[Math.min(smoothedPath.length - 1, segIdx + 1)];
        const lat = p0[0] + frac * (p1[0] - p0[0]);
        const lon = p0[1] + frac * (p1[1] - p0[1]);
        const bearing = initialBearingDeg(p0[0], p0[1], p1[0], p1[1]);

        // ROT & heading
        let rot = 0.0;
        if (lastBearing !== null) {
          const diff = ((bearing - lastBearing + 540.0) % 360.0) - 180.0;
          rot = diff * 2.0;
        }
        lastBearing = bearing;

        const headingOffset = Math.max(-12.0, Math.min(12.0, rot * 0.12));
        const sogNoise = (Math.random() - 0.5) * 0.3;
        const cogNoise = (Math.random() - 0.5) * 0.6;
        const hdgNoise = (Math.random() - 0.5) * 0.8;

        const finalSog = Math.max(0.0, Math.round((targetSpeedKts + sogNoise) * 10) / 10);
        const finalCog = Math.round(((bearing + cogNoise + 360.0) % 360.0) * 10) / 10;
        const finalHdg = Math.round((bearing + headingOffset + hdgNoise + 360.0) % 360.0);

        // Ping interval in seconds (Class A underway: 10 - 60s)
        let pingIntervalS = Math.floor(Math.random() * (45 - 20 + 1)) + 20;
        if (allowDropouts && Math.random() < 0.03) {
          pingIntervalS = Math.floor(Math.random() * (450 - 180 + 1)) + 180;
        }

        allPings.push({
          DateTime: currentDt.toISOString().replace(".000", ""),
          LAT: parseFloat(lat.toFixed(6)),
          LON: parseFloat(lon.toFixed(6)),
          SOG: finalSog,
          COG: finalCog,
          Heading: finalHdg,
          Name: vesselName,
          IMO: vesselImo,
          Type: vesselType,
          Status: defaultStatus
        });

        // Advance simulation step
        const speedMps = (targetSpeedKts * NM_TO_M) / 3600.0;
        const stepDistM = speedMps * pingIntervalS;
        currentDistM += Math.max(10.0, stepDistM);
        currentDt = new Date(currentDt.getTime() + pingIntervalS * 1000);
      }

      // If multi-leg and not last leg: inject moored pings at dock
      if (leg < numLegs && dwellHours > 0) {
        const dwellSeconds = dwellHours * 3600.0;
        let dwellElapsed = 0.0;
        const dockCoord = smoothedPath[smoothedPath.length - 1];

        while (dwellElapsed < dwellSeconds) {
          const dwellStepS = Math.floor(Math.random() * (360 - 180 + 1)) + 180;
          dwellElapsed += dwellStepS;
          currentDt = new Date(currentDt.getTime() + dwellStepS * 1000);

          allPings.push({
            DateTime: currentDt.toISOString().replace(".000", ""),
            LAT: parseFloat((dockCoord[0] + (Math.random() - 0.5) * 0.0001).toFixed(6)),
            LON: parseFloat((dockCoord[1] + (Math.random() - 0.5) * 0.0001).toFixed(6)),
            SOG: Math.round(Math.random() * 0.2 * 10) / 10,
            COG: Math.round(Math.random() * 360.0 * 10) / 10,
            Heading: Math.round(Math.random() * 360.0),
            Name: vesselName,
            IMO: vesselImo,
            Type: vesselType,
            Status: 5 // Moored
          });
        }
      }
    }

    // Trajectory Statistics
    let totalVoyageM = 0;
    for (let i = 1; i < allPings.length; i++) {
      totalVoyageM += haversineDistanceM(
        allPings[i - 1].LAT,
        allPings[i - 1].LON,
        allPings[i].LAT,
        allPings[i].LON
      );
    }
    const totalNm = Math.round(totalVoyageM * M_TO_NM * 100) / 100;
    const sogs = allPings.map((p) => p.SOG);
    const avgSog = Math.round((sogs.reduce((a, b) => a + b, 0) / Math.max(1, sogs.length)) * 10) / 10;
    const maxSog = Math.round(Math.max(...sogs, 0) * 10) / 10;

    const cleanSafeName = vesselName.replace(/[^a-zA-Z0-9]/g, "");
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const timeStamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    const csvFilename = `ais_${cleanSafeName}_${vesselImo}_${dateStamp}_${timeStamp}.csv`;

    return {
      success: true,
      csv_filename: csvFilename,
      pings: allPings,
      stats: {
        total_nm: totalNm,
        ping_count: allPings.length,
        avg_sog: avgSog,
        max_sog: maxSog,
        start_time: allPings[0].DateTime,
        end_time: allPings[allPings.length - 1].DateTime
      },
      waypoints: waypoints,
      vessel_profile: profile
    };
  }

  // Convert pings to standard 10-column RFC 4180 CSV string
  function pingsToCsvString(pings) {
    const headers = ["DateTime", "LAT", "LON", "SOG", "COG", "Heading", "Name", "IMO", "Type", "Status"];
    const rows = [headers.join(",")];

    pings.forEach((p) => {
      // Escape name if comma is present
      const safeName = p.Name.includes(",") ? `"${p.Name.replace(/"/g, '""')}"` : p.Name;
      rows.push(
        [
          p.DateTime,
          p.LAT.toFixed(6),
          p.LON.toFixed(6),
          p.SOG.toFixed(1),
          p.COG.toFixed(1),
          p.Heading.toFixed(0),
          safeName,
          p.IMO,
          p.Type,
          p.Status
        ].join(",")
      );
    });

    return rows.join("\n");
  }

  // Trigger browser download via Blob
  function downloadCsvBlob(pings, filename) {
    const csvContent = pingsToCsvString(pings);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // LocalStorage Run Persistence for GitHub Pages
  function saveRunToLocalStorage(runResult) {
    try {
      const STORAGE_KEY = "simsim_saved_runs";
      const existingStr = localStorage.getItem(STORAGE_KEY);
      const existing = existingStr ? JSON.parse(existingStr) : [];

      // Store summary & pings (capped to last 15 runs to prevent localStorage quota exhaustion)
      const runRecord = {
        filename: runResult.csv_filename,
        vessel_name: runResult.vessel_profile.Name,
        imo: runResult.vessel_profile.IMO,
        vessel_type: runResult.vessel_profile.Type,
        ping_count: runResult.stats.ping_count,
        total_nm: runResult.stats.total_nm,
        avg_sog: runResult.stats.avg_sog,
        max_sog: runResult.stats.max_sog,
        start_time: runResult.stats.start_time,
        end_time: runResult.stats.end_time,
        modified_at: new Date().toISOString().replace("T", " ").slice(0, 16),
        pings: runResult.pings.length > 5000 ? runResult.pings.slice(0, 5000) : runResult.pings // safe sample
      };

      const updated = [runRecord, ...existing.filter((r) => r.filename !== runResult.csv_filename)].slice(0, 15);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      // Also persist unique vessel identity for the historical picker
      const VESSEL_KEY = "simsim_historical_vessels";
      const vesselsStr = localStorage.getItem(VESSEL_KEY);
      const vessels = vesselsStr ? JSON.parse(vesselsStr) : [];
      const vKey = `${runRecord.vessel_name.toUpperCase()}___${runRecord.imo}`;
      if (!vessels.some((v) => `${v.Name.toUpperCase()}___${v.IMO}` === vKey)) {
        vessels.unshift({
          Name: runRecord.vessel_name,
          IMO: runRecord.imo,
          Type: runRecord.vessel_type,
          TypeLabel: `Type ${runRecord.vessel_type}`,
          runs_count: 1,
          last_simulated: runRecord.modified_at
        });
        localStorage.setItem(VESSEL_KEY, JSON.stringify(vessels.slice(0, 50)));
      }
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  }

  function getSavedRunsFromLocalStorage() {
    try {
      const STORAGE_KEY = "simsim_saved_runs";
      const str = localStorage.getItem(STORAGE_KEY);
      return str ? JSON.parse(str) : [];
    } catch (e) {
      return [];
    }
  }

  function getHistoricalVesselsFromLocalStorage() {
    try {
      const VESSEL_KEY = "simsim_historical_vessels";
      const str = localStorage.getItem(VESSEL_KEY);
      if (str) return JSON.parse(str);
    } catch (e) {}

    // Default starter vessels if none in localStorage
    return [
      {
        Name: "PACIFIC GLORY 12",
        IMO: "IMO9382104",
        Type: 70,
        TypeLabel: "70 - Cargo Ship (General / Bulk)",
        runs_count: 4,
        last_simulated: "2026-10-27 00:30"
      },
      {
        Name: "CAMELLIA TSUSHIMA",
        IMO: "IMO9182740",
        Type: 60,
        TypeLabel: "60 - Passenger Ferry (Ro-Pax)",
        runs_count: 12,
        last_simulated: "2026-10-26 21:15"
      },
      {
        Name: "YELLOW SEA PIONEER",
        IMO: "IMO9562219",
        Type: 71,
        TypeLabel: "71 - Container Ship",
        runs_count: 7,
        last_simulated: "2026-10-26 18:40"
      },
      {
        Name: "EASTERN HARBOR",
        IMO: "IMO9454448",
        Type: 80,
        TypeLabel: "80 - Tanker (Chemical / Clean)",
        runs_count: 3,
        last_simulated: "2026-10-26 14:10"
      }
    ];
  }

  // Expose on global window
  window.AisClientEngine = {
    simulateTrajectory: simulateTrajectoryClient,
    generateRandomImo: generateRandomImo,
    generateRandomName: generateRandomName,
    pingsToCsvString: pingsToCsvString,
    downloadCsvBlob: downloadCsvBlob,
    saveRunToLocalStorage: saveRunToLocalStorage,
    getSavedRunsFromLocalStorage: getSavedRunsFromLocalStorage,
    getHistoricalVesselsFromLocalStorage: getHistoricalVesselsFromLocalStorage
  };
})(window);
