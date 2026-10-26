/**
 * Centralized Maritime Mapping Framework & CARTO Configuration
 * Single Source of Truth (SSOT) for CARTO API keys, basemap tile layers,
 * regional geographic centers, and map layer lifecycle.
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'carto_api_key';
  const DEFAULT_KEY = 'cb1_3fzc_1_e47177e320e1c761d456a149';

  // Extract from URL query parameter (?api_key=... or ?key=...)
  function getUrlParamKey() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('api_key') || params.get('key');
    } catch (e) {
      return null;
    }
  }

  const MapConfig = {
    // Current Active Key (URL param > localStorage > default)
    getApiKey: function () {
      const urlKey = getUrlParamKey();
      if (urlKey) {
        localStorage.setItem(STORAGE_KEY, urlKey);
        return urlKey;
      }
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_KEY;
    },

    setApiKey: function (newKey) {
      const cleaned = (newKey || '').trim();
      if (cleaned) {
        localStorage.setItem(STORAGE_KEY, cleaned);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      this._notifyKeyChange(this.getApiKey());
    },

    // Key change event listeners
    _listeners: [],
    onKeyChange: function (callback) {
      if (typeof callback === 'function') {
        this._listeners.push(callback);
      }
    },
    _notifyKeyChange: function (key) {
      this._listeners.forEach(cb => {
        try { cb(key); } catch (err) { console.error('MapConfig listener error:', err); }
      });
    },

    // Standard Regional Coordinate Centers
    REGIONS: {
      EAST_ASIA: { center: [34.5, 129.8], zoom: 7, label: 'Korea - Japan Tsushima Corridor' },
      ASIA_MARITIME: { center: [23.5, 115.0], zoom: 4, label: 'Asian Maritime & South China Sea' },
      GLOBAL: { center: [20.0, 0.0], zoom: 3, label: 'Global Trade Lanes' }
    },

    // Tile URL Builder
    buildTileUrl: function (theme, key) {
      const activeKey = key !== undefined ? key : this.getApiKey();
      const keyParam = activeKey ? `?api_key=${encodeURIComponent(activeKey)}` : '';
      
      switch (theme) {
        case 'dark_all':
          return `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${keyParam}`;
        case 'dark_nolabels':
          return `https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png${keyParam}`;
        case 'dark_labels':
          return `https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png${keyParam}`;
        case 'light_all':
          return `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${keyParam}`;
        case 'light_nolabels':
          return `https://{s}.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}{r}.png${keyParam}`;
        case 'light_labels':
          return `https://{s}.basemaps.cartocdn.com/rastertiles/light_only_labels/{z}/{x}/{y}{r}.png${keyParam}`;
        case 'voyager_all':
        case 'voyager':
          return `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${keyParam}`;
        case 'voyager_nolabels':
          return `https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png${keyParam}`;
        case 'voyager_labels':
          return `https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png${keyParam}`;
        default:
          return `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${keyParam}`;
      }
    },

    // Factory: Standard Single Layer Basemap Dictionary (e.g. for ports visualizer)
    createSingleLayers: function (key) {
      const activeKey = key !== undefined ? key : this.getApiKey();
      const attrib = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

      return {
        dark: L.tileLayer(this.buildTileUrl('dark_all', activeKey), {
          attribution: attrib, subdomains: 'abcd', maxZoom: 19
        }),
        positron: L.tileLayer(this.buildTileUrl('light_all', activeKey), {
          attribution: attrib, subdomains: 'abcd', maxZoom: 19
        }),
        voyager: L.tileLayer(this.buildTileUrl('voyager_all', activeKey), {
          attribution: attrib, subdomains: 'abcd', maxZoom: 19
        })
      };
    },

    // Factory: LayerGroups with distinct basemap + overlay labels (e.g. for Studio & Viewer)
    createCompositeLayers: function (key) {
      const activeKey = key !== undefined ? key : this.getApiKey();
      const attrib = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

      return {
        dark: L.layerGroup([
          L.tileLayer(this.buildTileUrl('dark_nolabels', activeKey), { maxZoom: 19, subdomains: 'abcd', attribution: attrib }),
          L.tileLayer(this.buildTileUrl('dark_labels', activeKey), { maxZoom: 19, subdomains: 'abcd', opacity: 0.85 })
        ]),
        light: L.layerGroup([
          L.tileLayer(this.buildTileUrl('light_nolabels', activeKey), { maxZoom: 19, subdomains: 'abcd', attribution: attrib }),
          L.tileLayer(this.buildTileUrl('light_labels', activeKey), { maxZoom: 19, subdomains: 'abcd', opacity: 0.85 })
        ]),
        voyager: L.layerGroup([
          L.tileLayer(this.buildTileUrl('voyager_nolabels', activeKey), { maxZoom: 19, subdomains: 'abcd', attribution: attrib }),
          L.tileLayer(this.buildTileUrl('voyager_labels', activeKey), { maxZoom: 19, subdomains: 'abcd', opacity: 0.85 })
        ])
      };
    }
  };

  // Export to global scope
  global.MapConfig = MapConfig;

})(typeof window !== 'undefined' ? window : this);
