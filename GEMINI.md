# simsim & spatA — Project Guidelines

## Basemap Integration & API Key Management (Zero-UI Exposure)

When integrating third-party basemaps requiring an API key (CARTO, Mapbox, etc.) across the `simsim` and `spatA` cockpits:

### 1. Zero UI Exposure
- Never display or expose API keys in the user interface.
- No text inputs, "Enter API Key" forms, or modal settings dialogs on pages (`index.html`, `viewer.html`, `ports.html`, `spatA/index.html`).
- No status badges showing key status or hashes.
- Keep UI controls strictly restricted to basemap theme switching (Dark Matter, Positron, Voyager).

### 2. Centralized `MapConfig` Module Pattern
- All basemap layer creation, URL formatting, and key resolution are centralized in `static/js/map_config.js` and `spatA/static/js/map_config.js`.
- Resolution priority:
  1. URL query parameters (`?key=...` or `?api_key=...`) for headless/external injection.
  2. Browser `localStorage` (cached silently without UI prompts).
  3. Default constant `DEFAULT_KEY`.
- Tile URLs automatically append the encoded query parameter (`?key=...&api_key=...`).
- Consumer code exclusively calls factory methods:
  - `MapConfig.createSingleLayers()` for standard tile layers.
  - `MapConfig.createCompositeLayers()` for composite basemap + label overlay groups.
