/**
 * AIS Synthetic Run Viewer - Client Application Logic
 * Loads and visualizes synthetic telemetry runs from sim/ais_simulator/output/
 * Displays original drawn route alongside realistic synthesized AIS pings.
 */

let map;
let baseTileLayers = {};
let currentLayerName = "dark";

let currentRunData = null;
let drawnRouteLine = null;
let pingMarkersGroup = null;
let vesselMarker = null;

// Playback animation state
let isPlaying = false;
let playIndex = 0;
let playInterval = null;
let playbackSpeed = 5; // steps per tick

document.addEventListener("DOMContentLoaded", () => {
  initViewerMap();
  loadRunsList();
  initViewerControls();
  initCsvUploadHandlers();

  // Check URL query param ?file=...
  const params = new URLSearchParams(window.location.search);
  const targetFile = params.get("file");
  if (targetFile) {
    loadRunDetails(targetFile);
  }
});

function initViewerMap() {
  const region = (window.MapConfig && window.MapConfig.REGIONS.EAST_ASIA) || { center: [36.0, 130.0], zoom: 6 };
  map = L.map("map", {
    center: region.center || [36.0, 130.0],
    zoom: region.zoom || 6,
    zoomControl: false,
    attributionControl: false
  });

  L.control.zoom({ position: "topright" }).addTo(map);

  if (window.MapConfig) {
    baseTileLayers = window.MapConfig.createCompositeLayers();
    window.MapConfig.onKeyChange(() => {
      const active = currentLayerName;
      if (baseTileLayers[active]) map.removeLayer(baseTileLayers[active]);
      baseTileLayers = window.MapConfig.createCompositeLayers();
      if (baseTileLayers[active]) baseTileLayers[active].addTo(map);
    });
  }

  if (baseTileLayers.dark) {
    baseTileLayers.dark.addTo(map);
  }

  drawnRouteLine = L.polyline([], {
    color: "#ffb300",
    weight: 2,
    dashArray: "6, 6",
    opacity: 0.75
  }).addTo(map);

  pingMarkersGroup = L.layerGroup().addTo(map);
}

function setViewerBasemap(style) {
  if (baseTileLayers[currentLayerName]) {
    map.removeLayer(baseTileLayers[currentLayerName]);
  }
  if (baseTileLayers[style]) {
    baseTileLayers[style].addTo(map);
    currentLayerName = style;
  }
  document.querySelectorAll(".layer-picker .layer-btn[data-layer]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.layer === style);
  });
}

// ---------------------------------------------------------------------------
// Runs List & Details
// ---------------------------------------------------------------------------

async function loadRunsList() {
  const container = document.getElementById("runs-list-container");
  container.innerHTML = `<div style="padding: 16px; color: var(--text-muted); font-size: 12px;">Loading saved simulation runs...</div>`;

  try {
    const res = await fetch("/api/runs");
    const runs = await res.json();

    if (!runs || runs.length === 0) {
      container.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
          No simulation runs found.<br/>
          <a href="/" style="color: var(--accent-cyan); text-decoration: none; margin-top: 8px; display: inline-block;">
            Go to Studio to generate tracks →
          </a>
        </div>
      `;
      return;
    }

    container.innerHTML = "";
    runs.forEach((r, idx) => {
      const card = document.createElement("div");
      card.className = "run-card";
      card.dataset.filename = r.filename;
      card.innerHTML = `
        <div class="run-card-header">
          <span class="run-vessel-name">${r.vessel_name}</span>
          <span class="run-tag">Type ${r.vessel_type}</span>
        </div>
        <div class="run-card-meta">
          <span>IMO: <strong>${r.imo || "-"}</strong></span>
          <span>${r.ping_count} pings</span>
          <span>${r.total_nm} NM</span>
        </div>
        <div class="run-card-date">${r.modified_at} • ${r.size_kb} KB</div>
      `;

      card.addEventListener("click", () => {
        document.querySelectorAll(".run-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        loadRunDetails(r.filename);
      });

      container.appendChild(card);

      // Auto-load first item if no specific file selected
      if (idx === 0 && !new URLSearchParams(window.location.search).get("file")) {
        card.classList.add("active");
        loadRunDetails(r.filename);
      }
    });

  } catch (err) {
    container.innerHTML = `<div style="padding: 16px; color: var(--accent-red);">Failed to load runs: ${err.message}</div>`;
  }
}

async function loadRunDetails(filename) {
  stopPlayback();
  try {
    const res = await fetch(`/api/runs/${filename}`);
    if (!res.ok) throw new Error("Run not found");
    const data = await res.json();
    currentRunData = data;
    renderRunOnMap(data);
  } catch (err) {
    alert("Error loading run: " + err.message);
  }
}

function renderRunOnMap(data) {
  const pings = data.pings;
  const meta = data.meta || {};

  pingMarkersGroup.clearLayers();
  if (vesselMarker) {
    map.removeLayer(vesselMarker);
    vesselMarker = null;
  }

  // Render original drawn waypoints if available in metadata
  if (meta.waypoints && meta.waypoints.length > 0) {
    drawnRouteLine.setLatLngs(meta.waypoints);
  } else {
    drawnRouteLine.setLatLngs([]);
  }

  // If there's an anomalous detour route in metadata, render it with distinct style
  if (meta.osaka_waypoints && meta.osaka_waypoints.length > 0) {
    if (!window.osakaDetourLine) {
      window.osakaDetourLine = L.polyline([], {
        color: "#ff5252",
        weight: 2.5,
        dashArray: "4, 6",
        opacity: 0.9
      }).addTo(map);
    }
    window.osakaDetourLine.setLatLngs(meta.osaka_waypoints);
  } else if (window.osakaDetourLine) {
    window.osakaDetourLine.setLatLngs([]);
  }

  if (!pings || pings.length === 0) return;

  const latlngs = pings.map(p => [p.LAT, p.LON]);

  // For high-performance rendering on large datasets (e.g., 200k+ pings):
  // Render full polyline path, and subsample interactive circle markers
  const maxMarkers = 2500;
  const step = Math.max(1, Math.floor(pings.length / maxMarkers));

  for (let idx = 0; idx < pings.length; idx += step) {
    const p = pings[idx];
    const color = getSogColor(p.SOG);
    const circle = L.circleMarker([p.LAT, p.LON], {
      radius: 3.5,
      fillColor: color,
      color: "#ffffff",
      weight: 0.8,
      opacity: 0.85,
      fillOpacity: 0.85
    });

    circle.bindTooltip(`
      <div style="font-family: monospace; font-size: 11px;">
        <strong>#${idx + 1} ${p.Name || p.VesselName}</strong> (${p.IMO || 'No IMO'})<br/>
        Time: ${p.DateTime || p.BaseDateTime}<br/>
        SOG: ${p.SOG.toFixed(1)} kts | COG: ${p.COG.toFixed(1)}° | HDG: ${p.Heading.toFixed(0)}°<br/>
        Type: ${p.Type || p.VesselType} • Status: ${p.Status}<br/>
        Pos: ${p.LAT.toFixed(4)}, ${p.LON.toFixed(4)}
      </div>
    `);

    circle.on("click", () => {
      setPlaybackPosition(idx);
    });

    pingMarkersGroup.addLayer(circle);
  }

  // Fit Bounds
  map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50] });

  // Update Header & HUD
  document.getElementById("vessel-title-display").textContent = `${pings[0].Name || pings[0].VesselName} (${pings[0].IMO || 'No IMO'})${meta.total_days ? ` — ${meta.total_days} Days Simulation` : ''}`;
  document.getElementById("hud-viewer-pings").textContent = `${pings.length.toLocaleString()}`;
  document.getElementById("hud-viewer-dist").textContent = `${meta.total_nm ? meta.total_nm + ' NM' : (meta.total_days ? '~88,000 NM' : calculateDistanceNM(latlngs) + ' NM')}`;
  document.getElementById("hud-viewer-speed").textContent = `${meta.avg_sog || "--"} kts (Max ${meta.max_sog || "--"})`;

  // Init Playback Slider
  const slider = document.getElementById("timeline-slider");
  slider.max = pings.length - 1;
  slider.value = 0;
  setPlaybackPosition(0);

  // Setup Download Button
  const btnDl = document.getElementById("btn-viewer-download");
  btnDl.onclick = () => {
    if (window.AisClientEngine && data.pings) {
      window.AisClientEngine.downloadCsvBlob(data.pings, data.filename);
    } else {
      window.open(`/api/download/${data.filename}`, "_blank");
    }
  };
}

function calculateDistanceNM(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    m += map.distance(coords[i-1], coords[i]);
  }
  return (m / 1852.0).toFixed(1);
}

function getSogColor(sog) {
  if (sog < 2.0) return "#4fc3f7"; // Maneuver / Moored
  if (sog < 8.0) return "#29b6f6"; // Harbor
  if (sog < 15.0) return "#00e676"; // Cruising
  if (sog < 22.0) return "#ffb300"; // High Speed
  return "#ff5252"; // Peak / Boost
}

// ---------------------------------------------------------------------------
// Playback Animation Engine
// ---------------------------------------------------------------------------

function setPlaybackPosition(idx) {
  if (!currentRunData || !currentRunData.pings || !currentRunData.pings[idx]) return;

  playIndex = idx;
  const p = currentRunData.pings[idx];
  document.getElementById("timeline-slider").value = idx;

  // Leg & Phase badge
  const legEl = document.getElementById("playback-leg");
  if (legEl) {
    const isAnom = p.IsAnomaly === true;
    const phase = p.LegPhase || (p.Status === 5 ? 'moored' : 'underway');
    const legNum = p.LegNumber || 1;
    legEl.innerHTML = `Leg ${legNum} (${phase})${isAnom ? ' <span style="color: #f59e0b; font-size: 10px; font-weight:bold;">[ANOMALY]</span>' : ''}`;
  }

  const pbDt = p.DateTime || p.BaseDateTime || "";
  document.getElementById("playback-time").textContent = pbDt.replace("T", " ").replace("Z", " UTC");
  document.getElementById("playback-sog").textContent = `${p.SOG} kts`;
  document.getElementById("playback-cog").textContent = `${p.COG}°`;
  document.getElementById("playback-pos").textContent = `${p.LAT.toFixed(4)}, ${p.LON.toFixed(4)}`;

  // Create or move animated vessel marker
  const iconHtml = `
    <div style="transform: rotate(${p.Heading || p.COG}deg); transition: transform 0.2s ease;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="${getSogColor(p.SOG)}" stroke="#ffffff" stroke-width="2">
        <polygon points="12,2 21,22 12,17 3,22" />
      </svg>
    </div>
  `;

  const vesselIcon = L.divIcon({
    className: "animated-vessel-icon",
    html: iconHtml,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  if (!vesselMarker) {
    vesselMarker = L.marker([p.LAT, p.LON], { icon: vesselIcon }).addTo(map);
  } else {
    vesselMarker.setLatLng([p.LAT, p.LON]);
    vesselMarker.setIcon(vesselIcon);
  }
}

function togglePlayback() {
  if (isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (!currentRunData || !currentRunData.pings) return;
  isPlaying = true;
  const SVG_PLAY = `<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const SVG_PAUSE = `<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

  document.getElementById("btn-play-pause").innerHTML = SVG_PAUSE;

  playInterval = setInterval(() => {
    if (playIndex >= currentRunData.pings.length - 1) {
      stopPlayback();
      return;
    }
    setPlaybackPosition(Math.min(currentRunData.pings.length - 1, playIndex + 1));
  }, 100);
}

function stopPlayback() {
  const SVG_PLAY = `<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  isPlaying = false;
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
  const btn = document.getElementById("btn-play-pause");
  if (btn) btn.innerHTML = SVG_PLAY;
}

function initViewerControls() {
  document.getElementById("btn-play-pause").addEventListener("click", togglePlayback);

  document.getElementById("timeline-slider").addEventListener("input", (e) => {
    setPlaybackPosition(parseInt(e.target.value));
  });

  document.getElementById("btn-refresh-runs").addEventListener("click", loadRunsList);
}

// Client-side CSV File Upload & Drag-and-Drop Inspector
function parseUploadedCsv(csvText, filename) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return;

  const headerLine = lines[0];
  const headers = headerLine.split(",").map(h => h.trim().replace(/^"|"$/g, ""));

  const pings = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || "";
    });

    const dt = row["DateTime"] || row["BaseDateTime"] || "";
    const name = row["Name"] || row["VesselName"] || "Uploaded Vessel";
    const imo = row["IMO"] || "-";
    const vType = parseInt(row["Type"] || row["VesselType"] || 70);
    const lat = parseFloat(row["LAT"] || 0.0);
    const lon = parseFloat(row["LON"] || 0.0);
    const sog = parseFloat(row["SOG"] || 0.0);
    const cog = parseFloat(row["COG"] || 0.0);
    const hdg = parseFloat(row["Heading"] || 0.0);
    const status = parseInt(row["Status"] || 0);

    if (lat !== 0 || lon !== 0) {
      pings.push({
        DateTime: dt,
        LAT: lat,
        LON: lon,
        SOG: sog,
        COG: cog,
        Heading: hdg,
        Name: name,
        IMO: imo,
        Type: vType,
        Status: status
      });
    }
  }

  if (pings.length === 0) return;

  const sogs = pings.map(p => p.SOG);
  const avgSog = Math.round((sogs.reduce((a, b) => a + b, 0) / sogs.length) * 10) / 10;
  const maxSog = Math.round(Math.max(...sogs, 0) * 10) / 10;

  const runData = {
    filename: filename || "uploaded_trajectory.csv",
    meta: {
      total_nm: "Calculated",
      avg_sog: avgSog,
      max_sog: maxSog,
      start_time: pings[0].DateTime,
      end_time: pings[pings.length - 1].DateTime
    },
    pings: pings
  };

  loadedRunsCache.set(runData.filename, runData);
  currentRunData = runData;
  renderRunOnMap(runData);

  // Add card to top of sidebar
  const container = document.getElementById("runs-list-container");
  const card = document.createElement("div");
  card.className = "run-card active";
  card.dataset.filename = runData.filename;
  card.innerHTML = `
    <div class="run-card-header">
      <span class="run-vessel-name">${pings[0].Name}</span>
      <span class="run-tag">Uploaded</span>
    </div>
    <div class="run-card-meta">
      <span>IMO: <strong>${pings[0].IMO}</strong></span>
      <span>${pings.length} pings</span>
    </div>
    <div class="run-card-date">Just uploaded • Local</div>
  `;
  document.querySelectorAll(".run-card").forEach(c => c.classList.remove("active"));
  container.prepend(card);
}

function initCsvUploadHandlers() {
  const fileInput = document.getElementById("input-upload-csv");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        parseUploadedCsv(event.target.result, file.name);
      };
      reader.readAsText(file);
    });
  }

  // Drag and drop onto window/map
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".csv")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          parseUploadedCsv(event.target.result, file.name);
        };
        reader.readAsText(file);
      }
    }
  });
}
