/**
 * Palantir Foundry Maritime Operations - Universal App Shell Component
 * Guarantees 100% pixel-perfect consistency of Top Header & Solid Left Sidebar across every page:
 *   - index.html (Studio)
 *   - viewer.html (Voyage Telemetry & Fleet Overview)
 *   - ports.html (Ports & H3 Geofences)
 *   - spatA/index.html (spatA Spatial Analytics Workbench)
 *
 * Enforces:
 *   - User Global Rule 2: Solid structural sidebar flush against edge with tactile translateX(6px) hover.
 *   - User Profile: "User 007" / "Team Blue"
 *   - Automatic relative path resolution (works on root, subfolders, GitHub Pages, localhost, and file://)
 *   - Automatic active tab & active sidebar item highlight with zero layout shift.
 */

(function () {
  'use strict';

  // 1. Determine active page and relative root prefix
  const pathname = window.location.pathname.replace(/\\/g, '/');
  const isSpatA = pathname.includes('/spatA/') || pathname.endsWith('/spatA');
  const rootPrefix = isSpatA ? '../' : './';

  let activeKey = 'viewer';
  if (pathname.includes('ports.html') || pathname.endsWith('/ports')) {
    activeKey = 'ports';
  } else if (pathname.includes('spatA')) {
    activeKey = 'spata';
  } else if (pathname.includes('index.html') || pathname.endsWith('/simulator') || (pathname.endsWith('/') && !isSpatA)) {
    activeKey = 'studio';
  } else if (window.location.hash === '#fleet') {
    activeKey = 'fleet';
  } else {
    activeKey = 'viewer';
  }

  // 2. Navigation items definition (Single Source of Truth)
  const navTabs = [
    {
      key: 'studio',
      label: 'Studio',
      icon: 'sensors',
      url: `${rootPrefix}index.html`,
      title: 'Synthetic Route Studio & Telemetry Synthesis'
    },
    {
      key: 'viewer',
      label: 'Telemetry Viewer',
      icon: 'radar',
      url: `${rootPrefix}viewer.html`,
      title: 'Voyage Kinematics & H3 Predictive Cockpit'
    },
    {
      key: 'fleet',
      label: 'Fleet Overview',
      icon: 'directions_boat',
      url: `${rootPrefix}viewer.html#fleet`,
      title: 'All Active Vessels & Risk Monitor'
    },
    {
      key: 'ports',
      label: 'Ports & H3',
      icon: 'anchor',
      url: `${rootPrefix}ports.html`,
      title: 'NGA World Port Index & Uber H3 Hexagonal Grid'
    },
    {
      key: 'spata',
      label: 'spatA Workbench',
      icon: 'analytics',
      url: isSpatA ? './index.html' : `${rootPrefix}spatA/index.html`,
      title: 'High-Performance Spatiotemporal Analytics'
    }
  ];

  const sidebarItems = [
    {
      key: 'fleet',
      label: 'Fleet Overview',
      icon: 'directions_boat',
      badge: '1,402',
      badgeClass: 'text-slate-500 font-mono text-[11px]',
      url: `${rootPrefix}viewer.html#fleet`,
      view: 'fleet-overview'
    },
    {
      key: 'viewer',
      label: 'Voyage Telemetry',
      icon: 'radar',
      badge: '<span class="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse"></span>',
      url: `${rootPrefix}viewer.html`,
      view: 'voyage-telemetry'
    },
    {
      key: 'ports',
      label: 'Ports & H3 Geofences',
      icon: 'anchor',
      badge: '768',
      badgeClass: 'px-1.5 py-0.5 rounded bg-[#1164AF]/20 text-[#38bdf8] text-[10px] font-bold font-mono',
      url: `${rootPrefix}ports.html`,
      view: 'ports-h3'
    },
    {
      key: 'studio',
      label: 'Synthetic Route Studio',
      icon: 'sensors',
      badge: 'v2.0',
      badgeClass: 'px-1.5 py-0.5 rounded bg-white/10 text-slate-300 text-[10px] font-bold font-mono',
      url: `${rootPrefix}index.html`,
      view: 'studio'
    },
    {
      key: 'spata',
      label: 'spatA Spatial Workbench',
      icon: 'analytics',
      badge: 'PRO',
      badgeClass: 'px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold font-mono border border-amber-400/30',
      url: isSpatA ? './index.html' : `${rootPrefix}spatA/index.html`,
      view: 'spata'
    },
    {
      key: 'datalake',
      label: 'Medallion Data Lake',
      icon: 'database',
      badge: '4 TIERS',
      badgeClass: 'px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold font-mono border border-emerald-500/20',
      url: `${rootPrefix}viewer.html#datalake`,
      view: 'datalake'
    }
  ];

  // 3. Render Top Navigation Bar HTML
  function renderHeaderHtml() {
    const centerTabsHtml = navTabs.map(tab => {
      const isActive = tab.key === activeKey;
      const activeClass = isActive
        ? 'px-3 py-1 text-xs font-semibold text-[#38bdf8] bg-white/[0.06] rounded-lg border border-white/10 flex items-center gap-1.5 shadow-sm select-none'
        : 'px-3 py-1 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.04] transition flex items-center gap-1.5 select-none';
      return `
        <a href="${tab.url}" class="${activeClass}" title="${tab.title}" data-shell-tab="${tab.key}">
          <span class="material-symbols-outlined text-[15px]">${tab.icon}</span>
          <span>${tab.label}</span>
        </a>
      `;
    }).join('');

    return `
      <!-- Left Workspace Title & Breadcrumbs -->
      <div class="flex items-center gap-4">
        <a href="${rootPrefix}index.html" class="flex items-center gap-2 py-1 px-2.5 bg-white/[0.04] border border-white/10 rounded-xl hover:border-white/20 transition cursor-pointer select-none">
          <span class="material-symbols-outlined text-[#38bdf8] text-[18px]">hub</span>
          <span class="font-mono text-xs uppercase tracking-wider text-white font-bold">Palantir Foundry</span>
        </a>
        <div class="h-4 w-px bg-white/10"></div>
        <div class="flex items-center gap-1.5 text-xs">
          <span class="font-mono px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-400 text-[11px]">ROOT</span>
          <span class="material-symbols-outlined text-slate-500 text-[13px]">chevron_right</span>
          <span class="font-mono text-slate-400 text-[11px]">MARITIME_OPS</span>
          <span class="material-symbols-outlined text-slate-500 text-[13px]">chevron_right</span>
          <span class="text-white font-semibold text-xs tracking-wide">VesselTelemetryCore_v2</span>
        </div>
        <div class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span class="font-mono text-[10px] uppercase font-bold tracking-wider">SYNCED: LIVE</span>
        </div>
      </div>

      <!-- Center Cross-Tool Navigation (Frozen Dimensions Across All Screens) -->
      <div class="hidden lg:flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] p-1 rounded-xl">
        ${centerTabsHtml}
      </div>

      <!-- Right Controls: Omnibox & Operator Profile (User 007 / Team Blue) -->
      <div class="flex items-center gap-3">
        <div class="flex items-center bg-white/[0.03] border border-white/10 px-3 py-1.5 rounded-xl gap-2 text-slate-400 hover:border-white/20 transition cursor-pointer" onclick="const el=document.getElementById('input-search-vessel');if(el)el.focus();">
          <span class="material-symbols-outlined text-[16px]">search</span>
          <input type="text" id="input-search-vessel" placeholder="FIND OBJECT [IMO / CALLSIGN / UUID]" class="bg-transparent border-none outline-none text-xs font-mono text-slate-200 placeholder-slate-500 w-52" />
          <kbd class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300 ml-1">⌘K</kbd>
        </div>

        <div class="flex items-center gap-2">
          <!-- Direct File Load Trigger -->
          <label class="flex items-center justify-center p-2 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] text-slate-300 transition cursor-pointer" title="Open CSV File directly from output/ or disk">
            <span class="material-symbols-outlined text-[18px]">folder_open</span>
            <input type="file" id="file-picker-input" accept=".csv" class="hidden" />
          </label>
          <button type="button" class="flex items-center justify-center p-2 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] text-slate-300 transition cursor-pointer" title="Export Current Telemetry CSV" id="btn-export-csv">
            <span class="material-symbols-outlined text-[18px]">download</span>
          </button>
          <button type="button" class="flex items-center justify-center p-2 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] text-slate-300 transition cursor-pointer" title="Switch Theme or Settings" onclick="if(window.toggleThemeMenu)window.toggleThemeMenu();">
            <span class="material-symbols-outlined text-[18px]">layers</span>
          </button>

          <div class="h-4 w-px bg-white/10"></div>
          <div class="flex items-center gap-2.5 pl-1 select-none">
            <div class="text-right leading-tight">
              <div class="font-mono text-[11px] font-semibold text-slate-200">User 007</div>
              <div class="font-mono text-[9px] text-[#38bdf8] font-bold tracking-wider">Team Blue</div>
            </div>
            <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#1164AF] to-[#38bdf8] flex items-center justify-center shadow-lg shadow-[#1164AF]/20 border border-white/20">
              <span class="material-symbols-outlined text-white text-[17px]">person</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 4. Render Left Solid Sidebar HTML (User Global Rule 2 Standard)
  function renderSidebarHtml() {
    const navItemsHtml = sidebarItems.map(item => {
      const isActive = item.key === activeKey;
      const activeClass = isActive
        ? 'sidebar-nav-item active flex items-center justify-between px-3 py-2 rounded-xl text-white border border-white/10 transition group shadow-sm select-none'
        : 'sidebar-nav-item flex items-center justify-between px-3 py-2 rounded-xl text-slate-400 border border-transparent transition group select-none hover:text-white';
      const iconColor = isActive ? 'text-[#38bdf8]' : 'text-slate-400 group-hover:text-white';
      const badgeHtml = item.badgeClass ? `<span class="${item.badgeClass}">${item.badge}</span>` : item.badge;

      return `
        <a href="${item.url}" class="${activeClass}" data-view="${item.view || item.key}">
          <span class="flex items-center gap-2.5 text-sm font-medium">
            <span class="material-symbols-outlined text-[18px] ${iconColor} item-icon-box transition-transform">${item.icon}</span>
            <span>${item.label}</span>
          </span>
          ${badgeHtml}
        </a>
      `;
    }).join('');

    return `
      <div class="flex flex-col p-3">
        <div class="px-3 py-2 mb-2 flex items-center justify-between border-b border-white/[0.06]">
          <span class="font-mono text-[10px] tracking-widest uppercase text-slate-500 font-semibold">ONTOLOGY BINDINGS</span>
          <span class="font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#1164AF]/20 text-[#38bdf8] font-semibold border border-[#1164AF]/30">v4.18</span>
        </div>

        <nav class="space-y-1" id="sidebar-nav">
          ${navItemsHtml}
        </nav>
      </div>

      <!-- Bottom Mission-Critical System Status Deck -->
      <div class="p-3 border-t border-white/[0.06] bg-black/20 text-xs font-mono select-none">
        <div class="flex items-center justify-between text-slate-400 mb-2">
          <span class="flex items-center gap-1.5 text-[10px] tracking-wider uppercase font-semibold">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Telemetry Stream
          </span>
          <span class="text-emerald-400 font-bold text-[10px]">100% OK</span>
        </div>
        <div class="text-[10px] text-slate-500 flex justify-between">
          <span>Inmarsat-C Dual Link</span>
          <span class="text-slate-400" id="shell-clock-zulu">00:00:00 Z</span>
        </div>
      </div>
    `;
  }

  // 5. Mount or Hydrate Header & Sidebar
  function mountAppShell() {
    // Header
    const headerEl = document.querySelector('header');
    if (headerEl) {
      headerEl.className = 'fixed top-0 left-0 right-0 h-14 bg-[#090B10]/95 backdrop-blur-md z-50 flex items-center justify-between px-5 border-b border-white/[0.07]';
      headerEl.innerHTML = renderHeaderHtml();
    }

    // Sidebar: strictly target the solid navigation container
    const asideEl = document.querySelector('aside.sidebar-solid-container') || document.querySelector('aside:not(.sidebar)');
    if (asideEl) {
      asideEl.className = 'fixed left-0 top-14 bottom-0 w-64 sidebar-solid-container z-40 flex flex-col justify-between backdrop-blur-md select-none';
      asideEl.innerHTML = renderSidebarHtml();
    }

    // Live Clock in Sidebar
    setInterval(() => {
      const clockEl = document.getElementById('shell-clock-zulu');
      if (clockEl) {
        const now = new Date();
        clockEl.textContent = now.toISOString().substring(11, 19) + ' Z';
      }
    }, 1000);
  }

  // Auto-mount on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAppShell);
  } else {
    mountAppShell();
  }

  // Expose API for dynamic view updates
  window.AppShell = {
    setActivePage: function (pageKey) {
      activeKey = pageKey;
      mountAppShell();
    },
    getActivePage: function () {
      return activeKey;
    }
  };
})();
