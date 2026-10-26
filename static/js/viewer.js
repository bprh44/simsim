/**
 * AIS Synthetic Run Viewer - Client Application Logic
 * Loads and visualizes synthetic telemetry runs from sim/ais_simulator/output/
 * Displays original drawn route alongside realistic synthesized AIS pings.
 */

const CARTO_API_KEY = "cb1_3fzc_1_e47177e320e1c761d456a149";

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

  // Check URL query param ?file=...
  const params = new URLSearchParams(window.location.search);
  const targetFile = params.get("file");
  if (targetFile) {
    loadRunDetails(targetFile);
  }
});

function initViewerMap() {
  map = L.map("map", {
    center: [36.0, 130.0],
    zoom: 6,
    zoomControl: false,
    attributionControl: false
  });

  L.control.zoom({ position: "topright" }).addTo(map);

  const keyParam = CARTO_API_KEY ? `?key=${encodeURIComponent(CARTO_API_KEY)}` : "";

  baseTileLayers.dark = L.layerGroup([
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png${keyParam}`, {
      maxZoom: 19, subdomains: "abcd"
    }),
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}.png${keyParam}`, {
      maxZoom: 19, subdomains: "abcd", opacity: 0.8
    })
  ]);

  baseTileLayers.light = L.layerGroup([
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}.png${keyParam}`, {
      maxZoom: 19, subdomains: "abcd"
    }),
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/light_only_labels/{z}/{x}/{y}.png${keyParam}`, {
      maxZoom: 19, subdomains: "abcd", opacity: 0.8
    })
  ]);

  baseTileLayers.voyager = L.layerGroup([
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png${keyParam}`, {
      maxZoom: 19, subdomains: "abcd"
    }),
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png${keyParam}`, {
      maxZoom: 19, subdomains: "abcd", opacity: 0.8
    })
  ]);

  baseTileLayers.dark.addTo(map);

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
  document.querySelectorAll(".layer-btn").forEach(btn => {
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
          <span>MMSI: <strong>${r.mmsi}</strong></span>
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
        <strong>#${idx + 1} ${p.VesselName}</strong> (${p.MMSI})<br/>
        Time: ${p.BaseDateTime}<br/>
        SOG: ${p.SOG} kts | COG: ${p.COG}° | HDG: ${p.Heading}°<br/>
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
  document.getElementById("vessel-title-display").textContent = `${pings[0].VesselName} (MMSI: ${pings[0].MMSI})${meta.total_days ? ` — ${meta.total_days} Days Simulation` : ''}`;
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
  btnDl.onclick = () => window.open(`/api/download/${data.filename}`, "_blank");
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

  document.getElementById("playback-time").textContent = p.BaseDateTime.replace("T", " ").replace("Z", " UTC");
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
