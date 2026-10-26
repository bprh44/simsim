/**
 * AIS Route Simulator - Main Client Application Logic
 * Integrates Leaflet with Carto Basemaps API key: cb1_3fzc_1_e47177e320e1c761d456a149
 * Supports DirectFerries verified corridors (KR <-> JP, KR <-> CN, CN <-> JP, Domestic),
 * Multi-Leg Commute Loops (1 to 50 legs with port dwell times),
 * Interactive Midpoint Handles, Waypoint Sequence Table, and Anomaly Injection.
 */

const CARTO_API_KEY = "cb1_3fzc_1_e47177e320e1c761d456a149";

let map;
let baseTileLayers = {};
let currentLayerName = "dark";

// State
let waypoints = []; // [[lat, lon], ...]
let waypointMarkers = [];
let midpointMarkers = [];
let routePolyline = null;
let smoothedTrackPolyline = null;
let pingMarkersGroup = null;

let drawingMode = "click"; // "click" or "freehand"
let isFreehandDrawing = false;
let freehandRawPoints = [];

let currentVesselSpecs = {};
let availableCorridors = {};
let currentCorridorKey = "busan_fukuoka";
let lastSimulatedResult = null;

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  loadCorridors();
  loadVesselSpecs();
  loadVesselHistory();
  initFormControls();
  initDrawingTools();
  setLocalDefaultTimestamp();
});

function initMap() {
  const region = (window.MapConfig && window.MapConfig.REGIONS.EAST_ASIA) || { center: [34.5, 129.8], zoom: 7 };
  map = L.map("map", {
    center: region.center,
    zoom: region.zoom,
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

  // Layers for features
  routePolyline = L.polyline([], {
    color: "#ffb300",
    weight: 2.5,
    dashArray: "6, 6",
    opacity: 0.85
  }).addTo(map);

  smoothedTrackPolyline = L.polyline([], {
    color: "#00d2ff",
    weight: 3.5,
    opacity: 0.95
  }).addTo(map);

  pingMarkersGroup = L.layerGroup().addTo(map);

  map.on("click", onMapClick);

  const mapContainer = document.getElementById("map");
  mapContainer.addEventListener("mousedown", onMouseDownFreehand);
  window.addEventListener("mousemove", onMouseMoveFreehand);
  window.addEventListener("mouseup", onMouseUpFreehand);
}

function setBasemap(style) {
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
// Corridors & Preset Loading
// ---------------------------------------------------------------------------

async function loadCorridors() {
  try {
    const res = await fetch("/api/corridors");
    if (res.ok) {
      availableCorridors = await res.json();
    }
  } catch (err) {
    console.warn("Using static corridors dictionary fallback:", err);
  }

  if ((!availableCorridors || Object.keys(availableCorridors).length === 0) && window.CORRIDORS) {
    availableCorridors = window.CORRIDORS;
  }

  // Load default corridor
  loadCorridor("busan_fukuoka");
}

function loadCorridor(key) {
  currentCorridorKey = key;
  const corridor = availableCorridors[key];
  if (!corridor) return;

  // Update banner UI
  const titleEl = document.getElementById("banner-corridor-title");
  const descEl = document.getElementById("banner-corridor-desc");
  if (titleEl) titleEl.textContent = corridor.name;
  if (descEl) descEl.textContent = corridor.description;

  clearRoute();
  corridor.waypoints.forEach(pt => addWaypoint(pt, false));
  renderRoute();

  map.setView(corridor.center, corridor.zoom);

  // Set vessel type & cruise speed
  const typeSelect = document.getElementById("vessel-type-select");
  if (typeSelect && corridor.typical_vessel_type) {
    typeSelect.value = corridor.typical_vessel_type;
    onVesselTypeChanged(corridor.typical_vessel_type);
  }

  if (corridor.typical_cruise_speed) {
    document.getElementById("desired-speed").value = corridor.typical_cruise_speed;
    document.getElementById("speed-slider").value = corridor.typical_cruise_speed;
  }

  randomizeAllVesselFields();
  updateEstimatedHUD();
}

function reverseRoute() {
  if (waypoints.length < 2) return;
  waypoints.reverse();
  renderRoute();
  
  // Update banner text direction indicator if applicable
  const titleEl = document.getElementById("banner-corridor-title");
  if (titleEl && titleEl.textContent.includes("<->")) {
    const parts = titleEl.textContent.split("<->").map(s => s.trim());
    if (parts.length === 2) {
      titleEl.textContent = `${parts[1]} <-> ${parts[0]}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Vessel Specs & Identifiers
// ---------------------------------------------------------------------------

async function loadVesselSpecs() {
  try {
    const res = await fetch("/api/vessel_types");
    if (res.ok) {
      currentVesselSpecs = await res.json();
    }
  } catch (err) {
    console.warn("Using client-side vessel specs dictionary fallback:", err);
  }

  // Fallback to static window.VESSEL_SPECS if backend is offline / GitHub Pages
  if ((!currentVesselSpecs || Object.keys(currentVesselSpecs).length === 0) && window.VESSEL_SPECS) {
    currentVesselSpecs = window.VESSEL_SPECS;
  }

  // Authoritative ITU-R M.1371 AIS Vessel Types safety fallback
  if (!currentVesselSpecs || Object.keys(currentVesselSpecs).length === 0) {
    currentVesselSpecs = {
      "70": { type_code: 70, label: "70 - Cargo Ship (General / Bulk)", cruise_sog: 16.6 },
      "71": { type_code: 71, label: "71 - Container Ship", cruise_sog: 19.1 },
      "72": { type_code: 72, label: "72 - Bulk Carrier", cruise_sog: 14.5 },
      "80": { type_code: 80, label: "80 - Tanker (Oil / Chemical)", cruise_sog: 16.4 },
      "81": { type_code: 81, label: "81 - Crude Oil Tanker", cruise_sog: 15.5 },
      "82": { type_code: 82, label: "82 - Gas Carrier (LNG / LPG)", cruise_sog: 17.5 },
      "60": { type_code: 60, label: "60 - Passenger / Ferry", cruise_sog: 18.1 },
      "40": { type_code: 40, label: "40 - High Speed Craft (HSC)", cruise_sog: 28.1 },
      "52": { type_code: 52, label: "52 - Tug / Towing", cruise_sog: 12.0 },
      "30": { type_code: 30, label: "30 - Fishing Vessel", cruise_sog: 9.5 },
      "31": { type_code: 31, label: "31 - Towing / Offshore Service", cruise_sog: 11.0 },
      "50": { type_code: 50, label: "50 - Pilot Vessel", cruise_sog: 18.0 },
      "51": { type_code: 51, label: "51 - Search and Rescue", cruise_sog: 22.0 },
      "90": { type_code: 90, label: "90 - Other / Special Craft", cruise_sog: 12.5 }
    };
  }

  populateVesselTypeDropdown();
}

let historicalVessels = [];

async function loadVesselHistory() {
  const historySelect = document.getElementById("vessel-history-select");
  if (!historySelect) return;

  try {
    const res = await fetch("/api/vessels/history");
    if (res.ok) {
      const data = await res.json();
      historicalVessels = data.vessels || [];
    }
  } catch (err) {
    // Backend offline / GitHub Pages mode
  }

  if ((!historicalVessels || historicalVessels.length === 0) && window.AisClientEngine) {
    historicalVessels = window.AisClientEngine.getHistoricalVesselsFromLocalStorage();
  }

  historySelect.innerHTML = '<option value="">-- [ New / Custom Vessel Profile ] --</option>';

  historicalVessels.forEach((v, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = `${v.Name} (${v.IMO}) [${v.TypeLabel || 'Type ' + v.Type}] (${v.runs_count || 1} runs)`;
    historySelect.appendChild(opt);
  });

  historySelect.onchange = (e) => {
    const val = e.target.value;
    if (val !== "" && historicalVessels[val]) {
      const selected = historicalVessels[val];
      document.getElementById("vessel-name").value = selected.Name;
      document.getElementById("vessel-imo").value = selected.IMO;
      const typeSelect = document.getElementById("vessel-type-select");
      if (typeSelect) {
        typeSelect.value = selected.Type;
        onVesselTypeChanged(selected.Type);
      }
    }
  };
}

function populateVesselTypeDropdown() {
  const select = document.getElementById("vessel-type-select");
  if (!select) return;
  select.innerHTML = "";
  
  const sortedKeys = Object.keys(currentVesselSpecs).sort((a, b) => parseInt(a) - parseInt(b));
  
  sortedKeys.forEach(code => {
    const item = currentVesselSpecs[code];
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${item.label} (Cruise: ${item.cruise_sog} kts)`;
    if (code === "70") opt.selected = true; // default cargo
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    onVesselTypeChanged(parseInt(select.value));
  });

  onVesselTypeChanged(70);
  randomizeAllVesselFields();
}

function onVesselTypeChanged(typeCode) {
  const spec = currentVesselSpecs[typeCode] || {};
  const speedInput = document.getElementById("desired-speed");
  const speed = spec.cruise_sog || 16.5;
  if (speedInput) speedInput.value = speed;
  const speedSlider = document.getElementById("speed-slider");
  if (speedSlider) speedSlider.value = speed;
  updateEstimatedHUD();
}

async function randomizeAllVesselFields() {
  const select = document.getElementById("vessel-type-select");
  const typeCode = select ? select.value : 70;
  let data = null;

  try {
    const res = await fetch(`/api/random_vessel?vessel_type=${typeCode}`);
    if (res.ok) data = await res.json();
  } catch (err) {}

  if (!data && window.AisClientEngine) {
    const spec = (currentVesselSpecs && currentVesselSpecs[typeCode]) || {};
    data = {
      Name: window.AisClientEngine.generateRandomName(),
      IMO: window.AisClientEngine.generateRandomImo(),
      Type: parseInt(typeCode),
      TypeLabel: spec.label || `Type ${typeCode}`,
      Status: 0,
      TypicalCruiseSpeed: spec.cruise_sog || 16.5
    };
  }

  if (data) {
    const nameInput = document.getElementById("vessel-name");
    const imoInput = document.getElementById("vessel-imo");
    if (nameInput) nameInput.value = data.Name;
    if (imoInput) imoInput.value = data.IMO;
    const historySelect = document.getElementById("vessel-history-select");
    if (historySelect) historySelect.value = "";
    if (data.TypicalCruiseSpeed) {
      const speedInput = document.getElementById("desired-speed");
      if (speedInput) speedInput.value = data.TypicalCruiseSpeed;
      const speedSlider = document.getElementById("speed-slider");
      if (speedSlider) speedSlider.value = data.TypicalCruiseSpeed;
    }
    updateEstimatedHUD();
  }
}

async function randomizeSingleField(field) {
  try {
    const res = await fetch(`/api/random_vessel`);
    const data = await res.json();
    if (field === 'imo') {
      const imoEl = document.getElementById("vessel-imo");
      if (imoEl) imoEl.value = data.IMO;
    }
    if (field === 'name') {
      const nameEl = document.getElementById("vessel-name");
      if (nameEl) nameEl.value = data.Name;
    }
  } catch (err) {
    console.error("Field randomization failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Drawing Tools & Interactive Waypoint Management (With Midpoints & Table)
// ---------------------------------------------------------------------------

function setDrawingMode(mode) {
  drawingMode = mode;
  document.getElementById("btn-mode-click").classList.toggle("active", mode === "click");
  document.getElementById("btn-mode-freehand").classList.toggle("active", mode === "freehand");

  if (mode === "freehand") {
    map.dragging.disable();
    document.getElementById("map").style.cursor = "crosshair";
    document.getElementById("helper-tip-text").textContent = "Freehand Mode: Click & Drag across water to draw path";
  } else {
    map.dragging.enable();
    document.getElementById("map").style.cursor = "";
    document.getElementById("helper-tip-text").textContent = "Click map to add node, drag markers, or click midpoints (+) to insert";
  }
}

function onMapClick(e) {
  if (drawingMode !== "click") return;
  addWaypoint([e.latlng.lat, e.latlng.lng]);
}

function addWaypoint(latlng, refresh = true) {
  waypoints.push(latlng);
  if (refresh) renderRoute();
}

function insertWaypointAt(index, latlng) {
  waypoints.splice(index, 0, latlng);
  renderRoute();
}

function deleteWaypointAt(index) {
  if (index >= 0 && index < waypoints.length) {
    waypoints.splice(index, 1);
    renderRoute();
  }
}

function removeLastWaypoint() {
  if (waypoints.length > 0) {
    waypoints.pop();
    renderRoute();
  }
}

function clearRoute() {
  waypoints = [];
  renderRoute();
  if (pingMarkersGroup) pingMarkersGroup.clearLayers();
  if (smoothedTrackPolyline) smoothedTrackPolyline.setLatLngs([]);
  document.getElementById("hud-dist").textContent = "0.0 NM";
  document.getElementById("hud-time").textContent = "--:--";
  document.getElementById("hud-pings").textContent = "0";
}

function renderRoute() {
  // Clear old markers and midpoint handles
  waypointMarkers.forEach(m => map.removeLayer(m));
  waypointMarkers = [];
  midpointMarkers.forEach(m => map.removeLayer(m));
  midpointMarkers = [];

  // Update raw polyline
  routePolyline.setLatLngs(waypoints);

  // Render draggable waypoint markers
  waypoints.forEach((pt, idx) => {
    const isStart = idx === 0;
    const isEnd = idx === waypoints.length - 1 && waypoints.length > 1;

    let markerClass = "custom-wpt-marker";
    if (isStart) markerClass += " start";
    else if (isEnd) markerClass += " end";

    const customIcon = L.divIcon({
      className: markerClass,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const marker = L.marker(pt, {
      icon: customIcon,
      draggable: true
    }).addTo(map);

    marker.on("drag", (e) => {
      waypoints[idx] = [e.latlng.lat, e.latlng.lng];
      routePolyline.setLatLngs(waypoints);
      updateEstimatedHUD();
      updateWaypointTable();
    });

    marker.on("dragend", () => {
      renderRoute();
    });

    // Right click to delete waypoint
    marker.on("contextmenu", (e) => {
      L.DomEvent.stopPropagation(e);
      deleteWaypointAt(idx);
    });

    marker.bindTooltip(`WPT ${idx + 1}: ${pt[0].toFixed(3)}°, ${pt[1].toFixed(3)}° (Right-click to delete)`);
    waypointMarkers.push(marker);

    // Render interactive midpoint handle between this and the next waypoint
    if (idx < waypoints.length - 1) {
      const nextPt = waypoints[idx + 1];
      const midLat = (pt[0] + nextPt[0]) / 2.0;
      const midLon = (pt[1] + nextPt[1]) / 2.0;

      const midIcon = L.divIcon({
        className: "midpoint-node-icon",
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      const midMarker = L.marker([midLat, midLon], {
        icon: midIcon
      }).addTo(map);

      midMarker.bindTooltip("Click to insert new waypoint here");
      midMarker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        insertWaypointAt(idx + 1, [midLat, midLon]);
      });

      midpointMarkers.push(midMarker);
    }
  });

  document.getElementById("waypoint-count-text").textContent = `${waypoints.length} waypoints`;
  document.getElementById("btn-simulate").disabled = waypoints.length < 2;

  updateWaypointTable();
  updateEstimatedHUD();
}

function updateWaypointTable() {
  const tbody = document.getElementById("wpt-table-body");
  if (!tbody) return;

  if (waypoints.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 12px;">No waypoints defined</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  let cumNM = 0.0;

  waypoints.forEach((pt, idx) => {
    let segNM = 0.0;
    let cogDeg = "--";

    if (idx > 0) {
      const prev = waypoints[idx - 1];
      const m = map.distance(prev, pt);
      segNM = m / 1852.0;
      cumNM += segNM;

      // Bearing
      const lat1 = prev[0] * Math.PI / 180.0;
      const lat2 = pt[0] * Math.PI / 180.0;
      const dLon = (pt[1] - prev[1]) * Math.PI / 180.0;
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      const b = (Math.atan2(y, x) * 180.0 / Math.PI + 360.0) % 360.0;
      cogDeg = `${Math.round(b)}°`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="color: var(--accent-cyan); font-weight: bold;">${idx + 1}</td>
      <td>${pt[0].toFixed(3)}°, ${pt[1].toFixed(3)}°</td>
      <td>${segNM > 0 ? segNM.toFixed(1) + ' NM' : 'Start'}</td>
      <td>${cogDeg}</td>
      <td>
        <button type="button" class="btn-del-wpt" onclick="deleteWaypointAt(${idx})" title="Delete node">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Freehand Drawing Event Handlers
function onMouseDownFreehand(e) {
  if (drawingMode !== "freehand" || e.button !== 0) return;
  isFreehandDrawing = true;
  freehandRawPoints = [];
  const latlng = map.mouseEventToLatLng(e);
  freehandRawPoints.push([latlng.lat, latlng.lng]);
}

function onMouseMoveFreehand(e) {
  if (!isFreehandDrawing) return;
  const latlng = map.mouseEventToLatLng(e);
  const lastPt = freehandRawPoints[freehandRawPoints.length - 1];
  if (!lastPt || map.distance(latlng, lastPt) > 5000) {
    freehandRawPoints.push([latlng.lat, latlng.lng]);
    routePolyline.setLatLngs(freehandRawPoints);
  }
}

function onMouseUpFreehand() {
  if (!isFreehandDrawing) return;
  isFreehandDrawing = false;
  if (freehandRawPoints.length >= 2) {
    const simplified = simplifyPath(freehandRawPoints, 0.05);
    waypoints = simplified.slice(0, 30);
    renderRoute();
  }
  setDrawingMode("click");
}

function simplifyPath(points, tolerance) {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const p1 = points[0];
  const p2 = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], p1, p2);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > tolerance) {
    const recResults1 = simplifyPath(points.slice(0, index + 1), tolerance);
    const recResults2 = simplifyPath(points.slice(index), tolerance);
    return recResults1.slice(0, -1).concat(recResults2);
  } else {
    return [p1, p2];
  }
}

function perpendicularDistance(p, p1, p2) {
  const x = p[1], y = p[0];
  const x1 = p1[1], y1 = p1[0];
  const x2 = p2[1], y2 = p2[0];
  const numerator = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
  const denominator = Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));
  return denominator === 0 ? 0 : numerator / denominator;
}

// ---------------------------------------------------------------------------
// Calculations & HUD & Schedule Estimation
// ---------------------------------------------------------------------------

function calculateTotalDistanceNM(coords) {
  if (coords.length < 2) return 0;
  let meters = 0;
  for (let i = 1; i < coords.length; i++) {
    meters += map.distance(coords[i-1], coords[i]);
  }
  return meters / 1852.0;
}

function updateEstimatedHUD() {
  const singleLegNM = calculateTotalDistanceNM(waypoints);
  const speedKnots = parseFloat(document.getElementById("desired-speed").value) || 18.0;
  const numLegs = parseInt(document.getElementById("num-legs").value) || 1;
  const dwellHours = parseFloat(document.getElementById("port-dwell-hours").value) || 5.0;

  const transitHoursPerLeg = speedKnots > 0 ? singleLegNM / speedKnots : 0;
  const totalTransitHours = transitHoursPerLeg * numLegs;
  const totalDwellHours = (numLegs - 1) * dwellHours;
  const grandTotalHours = totalTransitHours + totalDwellHours;
  const grandTotalNM = singleLegNM * numLegs;

  const hrInt = Math.floor(transitHoursPerLeg);
  const minInt = Math.round((transitHoursPerLeg - hrInt) * 60);

  document.getElementById("hud-dist").textContent = `${singleLegNM.toFixed(1)} NM`;
  document.getElementById("hud-time").textContent = `${hrInt}h ${minInt}m`;
  document.getElementById("hud-speed").textContent = `${speedKnots.toFixed(1)} kts`;

  // Schedule Badge
  const badge = document.getElementById("schedule-summary-badge");
  if (badge) {
    if (numLegs === 1) {
      badge.textContent = `1 Leg • ${hrInt}h ${minInt}m`;
    } else {
      const days = Math.floor(grandTotalHours / 24.0);
      const remHours = Math.round(grandTotalHours % 24.0);
      badge.textContent = `${numLegs} Legs • ${days}d ${remHours}h (~${Math.round(grandTotalNM)} NM)`;
    }
  }

  // Update Execution Button Text
  const btnText = document.getElementById("btn-simulate-text");
  if (btnText) {
    btnText.textContent = numLegs > 1 
      ? `Generate ${numLegs}-Leg Scheduled Commute (${Math.round(grandTotalNM)} NM)`
      : `Generate Synthetic AIS Telemetry`;
  }
}

function setLocalDefaultTimestamp() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById("ref-datetime").value = now.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Simulation Execution & Rendering
// ---------------------------------------------------------------------------

async function executeSimulation() {
  if (waypoints.length < 2) {
    alert("Please draw or load at least 2 waypoints before simulating.");
    return;
  }

  const btn = document.getElementById("btn-simulate");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Synthesizing AIS Telemetry...`;

  const mmsi = parseInt(document.getElementById("vessel-mmsi").value) || 440123456;
  const imo = document.getElementById("vessel-imo").value.trim();
  const vesselName = document.getElementById("vessel-name").value.trim() || "COMMUTER FERRY";
  const callSign = document.getElementById("vessel-callsign").value.trim();
  const vesselType = parseInt(document.getElementById("vessel-type-select").value) || 60;
  const length = parseFloat(document.getElementById("vessel-length").value) || 140;
  const width = parseFloat(document.getElementById("vessel-width").value) || 24;
  const draft = parseFloat(document.getElementById("vessel-draft").value) || 6.5;

  const numLegs = parseInt(document.getElementById("num-legs").value) || 1;
  const dwellHours = parseFloat(document.getElementById("port-dwell-hours").value) || 5.0;
  const refTime = document.getElementById("ref-datetime").value;
  const desiredSpeed = parseFloat(document.getElementById("desired-speed").value) || 18.0;
  const allowOpenSea = document.getElementById("cb-open-seas").checked;
  const allowDropouts = document.getElementById("cb-dropouts").checked;

  // Anomaly config
  let anomalyConfig = null;
  const enableAnomaly = document.getElementById("cb-enable-anomaly").checked;
  if (enableAnomaly) {
    const targetLeg = parseInt(document.getElementById("anomaly-target-leg").value) || 1;
    const anomType = document.getElementById("anomaly-type-select").value;
    const paramVal = parseFloat(document.getElementById("anomaly-param-value").value) || 3.0;

    anomalyConfig = {
      enabled: true,
      target_leg: targetLeg,
      anomaly_type: anomType,
      delay_hours: anomType === "delay" ? paramVal : 3.0,
      speed_multiplier: anomType === "slow_steaming" ? 0.5 : 1.0,
      detour_nm: anomType === "spatial_detour" ? paramVal : 15.0
    };
  }

  const payload = {
    waypoints: waypoints,
    vessel_profile: {
      Name: vesselName,
      IMO: imo,
      Type: vesselType,
      Status: navStatus,
      TypicalCruiseSpeed: desiredSpeed
    },
    num_legs: numLegs,
    port_dwell_hours: dwellHours,
    timing_mode: "forward",
    reference_time: refTime ? new Date(refTime).toISOString() : null,
    desired_speed_knots: desiredSpeed,
    allow_open_sea_boost: allowOpenSea,
    anomaly_config: anomalyConfig,
    min_ping_gap_s: 15,
    max_ping_gap_s: 120,
    max_dropout_gap_s: 600,
    dropout_probability: allowDropouts ? 0.03 : 0.0
  };

  try {
    let result = null;

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        result = await res.json();
      }
    } catch (netErr) {
      // Backend not running (e.g. GitHub Pages static hosting)
    }

    if (!result && window.AisClientEngine) {
      // Synthesize trajectory client-side in the browser!
      result = window.AisClientEngine.simulateTrajectory(payload);
      window.AisClientEngine.saveRunToLocalStorage(result);
      loadVesselHistory(); // Refresh history dropdown with newly created vessel
    }

    if (!result) {
      throw new Error("Simulation failed. Client engine unavailable.");
    }

    lastSimulatedResult = result;
    renderSimulationResults(result);

  } catch (err) {
    alert("Simulation Error: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg class="ui-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> <span id="btn-simulate-text">${numLegs > 1 ? `Generate ${numLegs}-Leg Scheduled Commute` : `Generate Synthetic AIS Telemetry`}</span>`;
  }
}

function renderSimulationResults(result) {
  const pings = result.pings;
  if (!pings || pings.length === 0) return;

  pingMarkersGroup.clearLayers();

  // Draw smoothed track
  const trackCoords = pings.map(p => [p.LAT, p.LON]);
  smoothedTrackPolyline.setLatLngs(trackCoords);

  // Render AIS Pings with SOG Color Scale and Anomaly Ring
  pings.forEach((ping, idx) => {
    const color = getSogColor(ping.SOG);
    const isAnomaly = ping.IsAnomaly === true;

    const circle = L.circleMarker([ping.LAT, ping.LON], {
      radius: isAnomaly ? 6 : (ping.Status === 5 ? 3 : 4),
      fillColor: isAnomaly ? "#f59e0b" : color,
      color: isAnomaly ? "#ef4444" : "#ffffff",
      weight: isAnomaly ? 2 : 1,
      opacity: 0.95,
      fillOpacity: isAnomaly ? 0.95 : 0.85
    });

    circle.bindTooltip(`
      <div style="font-family: monospace; font-size: 11px;">
        <strong>${ping.Name || ping.VesselName}</strong> (${ping.IMO || 'No IMO'})<br/>
        Type: ${ping.Type || ping.VesselType} • Status: ${ping.Status}<br/>
        Time: ${ping.DateTime || ping.BaseDateTime}<br/>
        SOG: ${ping.SOG.toFixed(1)} kts | COG: ${ping.COG.toFixed(1)}° | Heading: ${ping.Heading.toFixed(0)}°<br/>
        LAT: ${ping.LAT.toFixed(4)} | LON: ${ping.LON.toFixed(4)}
      </div>
    `);

    pingMarkersGroup.addLayer(circle);
  });

  document.getElementById("hud-dist").textContent = `${result.stats.total_nm} NM`;
  document.getElementById("hud-pings").textContent = `${result.stats.ping_count}`;
  document.getElementById("hud-speed").textContent = `${result.stats.avg_sog} kts (Peak: ${result.stats.max_sog})`;

  showResultModal(result);
}

function getSogColor(sog) {
  if (sog < 1.0) return "#4fc3f7"; // Moored
  if (sog < 8.0) return "#29b6f6"; // Harbor
  if (sog < 16.0) return "#00e676"; // Cruising Moderate
  if (sog < 22.0) return "#ffb300"; // Fast Speed
  return "#ff5252"; // High Speed / Boost
}

function showResultModal(result) {
  document.getElementById("res-nm").textContent = `${result.stats.total_nm} NM`;
  document.getElementById("res-pings").textContent = `${result.stats.ping_count}`;
  document.getElementById("res-avg-sog").textContent = `${result.stats.avg_sog} kts`;
  document.getElementById("res-max-sog").textContent = `${result.stats.max_sog} kts`;
  document.getElementById("res-filename").textContent = result.csv_filename;

  const btnDl = document.getElementById("btn-download-csv");
  btnDl.onclick = () => {
    if (result.download_url && !result.download_url.startsWith("blob:")) {
      window.open(result.download_url, "_blank");
    } else if (window.AisClientEngine) {
      window.AisClientEngine.downloadCsvBlob(result.pings, result.csv_filename);
    }
  };

  const btnViewer = document.getElementById("btn-open-viewer");
  btnViewer.onclick = () => window.open(`viewer.html?file=${encodeURIComponent(result.csv_filename)}`, "_blank");

  // Sample preview table
  const tbody = document.getElementById("sample-tbody");
  tbody.innerHTML = "";
  const sample = result.pings.slice(0, 12);
  sample.forEach(p => {
    const tr = document.createElement("tr");
    const dt = p.DateTime || p.BaseDateTime || "";
    tr.innerHTML = `
      <td>${dt.length > 19 ? dt.slice(0, 19).replace('T', ' ') : dt}</td>
      <td>${p.LAT.toFixed(4)}</td>
      <td>${p.LON.toFixed(4)}</td>
      <td style="color: ${getSogColor(p.SOG)}; font-weight: bold;">${p.SOG.toFixed(1)}</td>
      <td>${p.COG.toFixed(1)}°</td>
      <td>${p.Heading.toFixed(0)}°</td>
      <td><strong>${p.Name || p.VesselName}</strong></td>
      <td><code>${p.IMO}</code></td>
      <td>${p.Type || p.VesselType}</td>
      <td>${p.Status === 5 ? '5 (Moored)' : p.Status}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("results-modal").classList.add("show");
}

function closeResultModal() {
  document.getElementById("results-modal").classList.remove("show");
}

function initFormControls() {
  // Speed Slider sync
  const slider = document.getElementById("speed-slider");
  const numInput = document.getElementById("desired-speed");
  const speedDisplay = document.getElementById("speed-display");

  slider.addEventListener("input", (e) => {
    numInput.value = e.target.value;
    speedDisplay.textContent = `${e.target.value} kts`;
    updateEstimatedHUD();
  });
  numInput.addEventListener("input", (e) => {
    slider.value = e.target.value;
    speedDisplay.textContent = `${e.target.value} kts`;
    updateEstimatedHUD();
  });

  // Scheduled Legs Slider sync
  const legsSlider = document.getElementById("legs-slider");
  const legsInput = document.getElementById("num-legs");
  const legsDisplay = document.getElementById("legs-count-display");

  legsSlider.addEventListener("input", (e) => {
    legsInput.value = e.target.value;
    legsDisplay.textContent = `${e.target.value} ${e.target.value === '1' ? 'Leg' : 'Legs'}`;
    updateEstimatedHUD();
  });
  legsInput.addEventListener("input", (e) => {
    legsSlider.value = e.target.value;
    legsDisplay.textContent = `${e.target.value} ${e.target.value === '1' ? 'Leg' : 'Legs'}`;
    updateEstimatedHUD();
  });

  // Dwell Time Slider sync
  const dwellSlider = document.getElementById("dwell-slider");
  const dwellInput = document.getElementById("port-dwell-hours");
  const dwellDisplay = document.getElementById("dwell-display");

  dwellSlider.addEventListener("input", (e) => {
    dwellInput.value = e.target.value;
    dwellDisplay.textContent = `${parseFloat(e.target.value).toFixed(1)} hrs`;
    updateEstimatedHUD();
  });
  dwellInput.addEventListener("input", (e) => {
    dwellSlider.value = e.target.value;
    dwellDisplay.textContent = `${parseFloat(e.target.value).toFixed(1)} hrs`;
    updateEstimatedHUD();
  });

  // Anomaly Controls
  const cbAnomaly = document.getElementById("cb-enable-anomaly");
  const anomOptions = document.getElementById("anomaly-options");
  const anomCard = document.getElementById("anomaly-card");
  const anomTypeSelect = document.getElementById("anomaly-type-select");
  const anomParamLabel = document.getElementById("anomaly-param-label");
  const anomParamInput = document.getElementById("anomaly-param-value");

  cbAnomaly.addEventListener("change", () => {
    const active = cbAnomaly.checked;
    anomOptions.style.display = active ? "block" : "none";
    anomCard.classList.toggle("active", active);
  });

  anomTypeSelect.addEventListener("change", (e) => {
    const val = e.target.value;
    if (val === "delay") {
      anomParamLabel.textContent = "Delay Magnitude (Hours):";
      anomParamInput.value = "3.0";
      anomParamInput.step = "0.5";
    } else if (val === "slow_steaming") {
      anomParamLabel.textContent = "Speed Factor (e.g. 0.5 = 50% Speed):";
      anomParamInput.value = "0.5";
      anomParamInput.step = "0.1";
    } else if (val === "spatial_detour") {
      anomParamLabel.textContent = "Track Detour Offset (NM):";
      anomParamInput.value = "15.0";
      anomParamInput.step = "1.0";
    }
  });

  // Preset Selector
  document.getElementById("preset-select").addEventListener("change", (e) => {
    if (e.target.value) loadCorridor(e.target.value);
  });

  // Reverse route button
  const btnReverse = document.getElementById("btn-reverse-route");
  if (btnReverse) {
    btnReverse.addEventListener("click", reverseRoute);
  }
}

function initDrawingTools() {
  document.getElementById("btn-mode-click").addEventListener("click", () => setDrawingMode("click"));
  document.getElementById("btn-mode-freehand").addEventListener("click", () => setDrawingMode("freehand"));
  document.getElementById("btn-undo").addEventListener("click", removeLastWaypoint);
  document.getElementById("btn-clear").addEventListener("click", clearRoute);
  document.getElementById("btn-simulate").addEventListener("click", executeSimulation);

  // Close modal button
  const closeBtn = document.querySelector(".btn-close-modal");
  if (closeBtn) closeBtn.addEventListener("click", closeResultModal);
}
