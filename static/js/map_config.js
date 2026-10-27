/**
 * Centralized Maritime Mapping Framework & CARTO Configuration
 * Single Source of Truth (SSOT) for CARTO API keys, basemap tile layers,
 * regional geographic centers, and map layer lifecycle.
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'carto_api_key';
  const DEFAULT_KEY = 'cb1_3fzc_1_e47177e320e1c761d456a149';

  // Extract from URL query parameter (?key=... or ?api_key=...)
  function getUrlParamKey() {
    try {
      if (typeof window === 'undefined' || !window.location) return null;
      const params = new URLSearchParams(window.location.search);
      return params.get('key') || params.get('api_key');
    } catch (e) {
      return null;
    }
  }

  const MapConfig = {
    DEFAULT_KEY: DEFAULT_KEY,
    STORAGE_KEY: STORAGE_KEY,

    // Current Active Key (URL param > localStorage > default)
    getApiKey: function () {
      const urlKey = getUrlParamKey();
      if (urlKey && urlKey.trim()) {
        const cleaned = urlKey.trim();
        try {
          localStorage.setItem(STORAGE_KEY, cleaned);
        } catch (e) {}
        return cleaned;
      }
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && stored.trim()) {
          return stored.trim();
        }
      } catch (e) {}
      return DEFAULT_KEY;
    },

    setApiKey: function (newKey) {
      const cleaned = (newKey || '').trim();
      try {
        if (cleaned && cleaned !== DEFAULT_KEY) {
          localStorage.setItem(STORAGE_KEY, cleaned);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        console.warn('MapConfig localStorage write failed:', e);
      }
      this._notifyKeyChange(this.getApiKey());
    },

    resetToDefaultKey: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      const defKey = DEFAULT_KEY;
      this._notifyKeyChange(defKey);
      return defKey;
    },

    isDefaultKey: function () {
      return this.getApiKey() === DEFAULT_KEY;
    },

    getKeySource: function () {
      const urlKey = getUrlParamKey();
      if (urlKey && urlKey.trim()) return 'url';
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && stored.trim() && stored.trim() !== DEFAULT_KEY) return 'storage';
      } catch (e) {}
      return 'default';
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
    // NOTE: CARTO officially requires "?key=YOUR_API_KEY".
    // We append ?key=...&api_key=... for maximum compatibility across all endpoints.
    buildTileUrl: function (theme, key) {
      const activeKey = key !== undefined ? key : this.getApiKey();
      const keyParam = activeKey ? `?key=${encodeURIComponent(activeKey)}&api_key=${encodeURIComponent(activeKey)}` : '';
      
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
        light: L.tileLayer(this.buildTileUrl('light_all', activeKey), {
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
        positron: L.layerGroup([
          L.tileLayer(this.buildTileUrl('light_nolabels', activeKey), { maxZoom: 19, subdomains: 'abcd', attribution: attrib }),
          L.tileLayer(this.buildTileUrl('light_labels', activeKey), { maxZoom: 19, subdomains: 'abcd', opacity: 0.85 })
        ]),
        voyager: L.layerGroup([
          L.tileLayer(this.buildTileUrl('voyager_nolabels', activeKey), { maxZoom: 19, subdomains: 'abcd', attribution: attrib }),
          L.tileLayer(this.buildTileUrl('voyager_labels', activeKey), { maxZoom: 19, subdomains: 'abcd', opacity: 0.85 })
        ])
      };
    },

    // Centralized Interactive API Key Modal Dialog
    openKeyModal: function () {
      let modalEl = document.getElementById('carto-key-modal');
      if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'carto-key-modal';
        modalEl.className = 'results-modal';
        modalEl.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(4, 7, 13, 0.82); backdrop-filter: blur(8px); z-index: 3000; display: none; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
        modalEl.innerHTML = `
          <div class="modal-content" style="background: #0d1527; border: 1px solid rgba(0, 229, 255, 0.35); border-radius: 12px; width: 92%; max-width: 540px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 229, 255, 0.15); color: #f0f6fc;">
            <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid rgba(72, 110, 165, 0.25); display: flex; align-items: center; justify-content: space-between;">
              <div class="modal-title" style="color: #00e5ff; display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21 2-2 2m-6 6 7 7-3 3-7-7-4 4a2 2 0 0 1-2.83 0l-1.34-1.34a2 2 0 0 1 0-2.83l4-4-7-7 3-3 7 7 4-4Z"/></svg>
                <span>CARTO Maps API Key Configuration</span>
              </div>
              <button type="button" class="btn-close" id="btn-close-carto-modal" title="Close dialog" style="background: transparent; border: none; color: #8fa1bc; font-size: 22px; cursor: pointer; line-height: 1;">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px; font-size: 13px;">
              <p style="margin-bottom: 12px; color: #8fa1bc; line-height: 1.5;">
                This key is the <strong style="color: #f0f6fc;">centralized Single Source of Truth (SSOT)</strong> for all Leaflet basemaps across <span style="color: #00e5ff; font-weight: 600;">Studio</span>, <span style="color: #a855f7; font-weight: 600;">Viewer</span>, and <span style="color: #00ffaa; font-weight: 600;">Ports &amp; H3 Grid</span>.
              </p>
              
              <div style="margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <label style="font-weight: 600; color: #f0f6fc; font-size: 12px;">Active CARTO API Key</label>
                  <span id="carto-modal-status-badge" style="font-size: 10px; font-family: monospace; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;"></span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <input type="text" id="carto-modal-key-input" spellcheck="false" autocomplete="off"
                    style="flex: 1; font-family: 'JetBrains Mono', monospace; font-size: 12px; padding: 10px 12px; background: rgba(0,0,0,0.55); border: 1px solid rgba(72, 110, 165, 0.4); border-radius: 6px; color: #00e5ff; outline: none;" />
                  <button type="button" id="btn-carto-copy-key" style="background: rgba(18, 29, 50, 0.85); border: 1px solid rgba(72, 110, 165, 0.35); border-radius: 6px; color: #f0f6fc; padding: 10px 14px; font-size: 11px; cursor: pointer; font-weight: 600;" title="Copy to clipboard">
                    Copy
                  </button>
                </div>
              </div>

              <div style="background: rgba(0, 229, 255, 0.05); border: 1px solid rgba(0, 229, 255, 0.18); border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-size: 11px; color: #8fa1bc; line-height: 1.5;">
                <div style="display: flex; gap: 6px; align-items: flex-start;">
                  <span style="color: #00e5ff; font-weight: bold;">Tip:</span>
                  <span>Saving here persists to <code>localStorage</code> and automatically updates all open browser tabs and maps in real-time. You can also append <code>?key=...</code> to any page URL.</span>
                </div>
              </div>

              <div id="carto-modal-toast" style="display: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 10px; background: rgba(0, 230, 118, 0.15); border: 1px solid #00e676; color: #00e676; text-align: center; font-weight: 600;">
                ✓ API Key successfully updated and broadcast to all maps!
              </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: space-between; padding: 14px 20px; border-top: 1px solid rgba(72, 110, 165, 0.25);">
              <button type="button" id="btn-carto-reset-default" style="background: transparent; border: 1px solid rgba(255, 179, 0, 0.4); color: #ffb300; border-radius: 6px; padding: 7px 14px; font-size: 12px; cursor: pointer; font-weight: 600;">
                Reset to Default
              </button>
              <div style="display: flex; gap: 8px;">
                <button type="button" id="btn-carto-modal-cancel" style="background: rgba(18, 29, 50, 0.85); border: 1px solid rgba(72, 110, 165, 0.3); border-radius: 6px; color: #8fa1bc; padding: 7px 14px; font-size: 12px; cursor: pointer;">
                  Cancel
                </button>
                <button type="button" id="btn-carto-modal-save" style="background: linear-gradient(135deg, #00e5ff, #0077ff); border: none; border-radius: 6px; color: #070a12; padding: 7px 16px; font-size: 12px; cursor: pointer; font-weight: 700;">
                  Save &amp; Apply
                </button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modalEl);

        // Bind modal events
        document.getElementById('btn-close-carto-modal').onclick = () => MapConfig.closeKeyModal();
        document.getElementById('btn-carto-modal-cancel').onclick = () => MapConfig.closeKeyModal();
        
        modalEl.onclick = (e) => {
          if (e.target === modalEl) MapConfig.closeKeyModal();
        };

        document.getElementById('btn-carto-reset-default').onclick = () => {
          const input = document.getElementById('carto-modal-key-input');
          input.value = DEFAULT_KEY;
          MapConfig.resetToDefaultKey();
          updateModalStatus();
          showToast('Reset to default project CARTO key.');
        };

        document.getElementById('btn-carto-modal-save').onclick = () => {
          const input = document.getElementById('carto-modal-key-input');
          MapConfig.setApiKey(input.value);
          updateModalStatus();
          showToast('✓ CARTO Key saved! All map tiles refreshed.');
          setTimeout(() => MapConfig.closeKeyModal(), 1000);
        };

        document.getElementById('btn-carto-copy-key').onclick = () => {
          const input = document.getElementById('carto-modal-key-input');
          if (navigator.clipboard) {
            navigator.clipboard.writeText(input.value).then(() => {
              showToast('Copied key to clipboard.');
            }).catch(() => {
              showToast('Key copied.');
            });
          }
        };

        document.getElementById('carto-modal-key-input').onkeydown = (e) => {
          if (e.key === 'Enter') {
            document.getElementById('btn-carto-modal-save').click();
          }
        };
      }

      function updateModalStatus() {
        const input = document.getElementById('carto-modal-key-input');
        const badge = document.getElementById('carto-modal-status-badge');
        const current = MapConfig.getApiKey();
        input.value = current;

        if (MapConfig.isDefaultKey()) {
          badge.textContent = 'Default Project Key';
          badge.style.background = 'rgba(0, 229, 255, 0.15)';
          badge.style.border = '1px solid #00e5ff';
          badge.style.color = '#00e5ff';
        } else {
          badge.textContent = 'Custom User Key';
          badge.style.background = 'rgba(168, 85, 247, 0.2)';
          badge.style.border = '1px solid #a855f7';
          badge.style.color = '#c084fc';
        }
      }

      function showToast(msg) {
        const toast = document.getElementById('carto-modal-toast');
        if (toast) {
          toast.textContent = msg;
          toast.style.display = 'block';
          setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }
      }

      updateModalStatus();
      modalEl.style.display = 'flex';
      setTimeout(() => {
        const input = document.getElementById('carto-modal-key-input');
        if (input) input.focus();
      }, 50);
    },

    closeKeyModal: function () {
      const modalEl = document.getElementById('carto-key-modal');
      if (modalEl) {
        modalEl.style.display = 'none';
      }
    }
  };

  // Cross-tab synchronization via storage event
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) {
        MapConfig._notifyKeyChange(MapConfig.getApiKey());
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        MapConfig.closeKeyModal();
      }
    });
  }

  // Export to global scope
  global.MapConfig = MapConfig;

})(typeof window !== 'undefined' ? window : this);
