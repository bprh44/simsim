---
name: Maritime Intelligence & Voyage Operations Widget System
colors:
  surface: '#0f131b'
  surface-dim: '#0f131b'
  surface-bright: '#353942'
  surface-container-lowest: '#0a0e16'
  surface-container-low: '#181c24'
  surface-container: '#1c2028'
  surface-container-high: '#262a33'
  surface-container-highest: '#31353e'
  on-surface: '#dfe2ee'
  on-surface-variant: '#c1c7d3'
  inverse-surface: '#dfe2ee'
  inverse-on-surface: '#2c3039'
  outline: '#8b919c'
  outline-variant: '#414751'
  surface-tint: '#a3c9ff'
  primary: '#a3c9ff'
  on-primary: '#00315d'
  primary-container: '#1164af'
  on-primary-container: '#cee0ff'
  inverse-primary: '#0460aa'
  secondary: '#f8ce2f'
  on-secondary: '#3c2f00'
  secondary-container: '#dab202'
  on-secondary-container: '#574500'
  tertiary: '#7bdb91'
  on-tertiary: '#003918'
  tertiary-container: '#007236'
  on-tertiary-container: '#94f4a8'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d3e3ff'
  primary-fixed-dim: '#a3c9ff'
  on-primary-fixed: '#001c39'
  on-primary-fixed-variant: '#004883'
  secondary-fixed: '#ffe07f'
  secondary-fixed-dim: '#ecc321'
  on-secondary-fixed: '#231b00'
  on-secondary-fixed-variant: '#564500'
  tertiary-fixed: '#97f7ab'
  tertiary-fixed-dim: '#7bdb91'
  on-tertiary-fixed: '#00210b'
  on-tertiary-fixed-variant: '#005225'
  background: '#0f131b'
  on-background: '#dfe2ee'
  surface-variant: '#31353e'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 12px
    letterSpacing: 0.04em
  data-metric:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 22px
    letterSpacing: -0.02em
  data-telemetry:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.01em
spacing:
  gutter: 0.5rem
  margin: 0.75rem
  space-xs: 0.125rem
  space-sm: 0.25rem
  space-md: 0.5rem
  space-lg: 0.75rem
  space-xl: 1rem
---

## Brand & Style

This design system establishes a high-density, mission-critical operations environment engineered specifically for embedded Palantir Foundry Workshop and Slate applications. Tailored for maritime domain intelligence, fleet surveillance, automated voyage telemetry, and compliance auditing, the interface communicates uncompromising precision, situational awareness, and technical authority.

### Aesthetic & Stylistic Foundation
The visual language operates on **Foundry Technical Precision**—a blend of utilitarian enterprise functionalism and tactile instrumentation:
- **Foundry Canvas Infrastructure:** Dark, layered slate surfaces eliminate visual fatigue in dual-screen and operations center environments during prolonged watch-keeping shifts.
- **Instrument Density:** Information density is maximized without inducing cognitive overload. Screen real estate is allocated strictly to spatial charts, operational queues, data tables, and object-card manifests.
- **Controlled Chromatic Hierarchy:** Vibrant canonical color families are reserved strictly for semantic classification, operational statuses, and telemetry thresholds against a low-contrast neutral substrate.
- **Engineered Restraint:** Zero decorative gradients, no ambient drop shadows, and sharp structural bounding to maintain exact alignment with Foundry’s native module grid.

## Colors

The system uses an enterprise palette optimized for deep-slate contrast ratios, low eye strain in low-light tactical environments, and compliance with Organizational Color Standard 2.0.0.

### Surface Architecture
- **Canvas Base (`#0E1217`):** Deepest structural canvas for root workshop backgrounds and embedded frame containers.
- **Surface Layer 1 (`#13171F`):** Standard panel, widget chassis, and sidebar workspace background.
- **Surface Layer 2 (`#1B212C`):** Grouped item cards, interactive table rows, and secondary containers.
- **Surface Layer 3 (`#242C3B`):** Hover states, active selection backdrops, popovers, and sticky headers.
- **Structural Border (`#2B3545`):** Crisp 1px rule separating all visual modules and telemetry cells.

### Neutral Text Hierarchy
- **Text High-Contrast Primary (`#F1F5F9`):** Primary data points, active headers, AIS indicators, and object IDs.
- **Text Secondary (`#CBD5E1`):** Field labels, regular tabular content, breadcrumbs, and timestamp strings.
- **Text Tertiary / Muted (`#94A3B8`):** Inactive parameters, metadata tags, unit descriptors, and baseline guides.

### Canonical Identity Color Families
Color tokens carry invariant operational semantics across all views:
- **Operations & Execution (`#1164AF`):** Vessel tracking, route coordinates, active leg execution, propulsion states.
- **Requirements & Resourcing (`#F8CE2F`):** Bunker procurement, fuel reserves, payload deficit, charter demands.
- **Knowledge & Document Intelligence (`#2A2E80`):** Voyage dossier artifacts, captain logs, bills of lading, sanctions documentation.
- **Planning & Alternatives (`#8A17AC`):** Simulation envelopes, alternate maritime waypoints, weather bypass routes.
- **Assessment & Partnerships (`#117B3D`):** Vetting certifications, surveyor audits, Lloyd’s register ratings, insurer syndicates.
- **AI & Collaboration (`#6D4F28`):** Anomaly inference vectors, automated alerts, collaborative annotations.
- **Governance, Telemetry & Control (`#BAB8B8`):** AIS transponder baselines, metadata schemas, sensor calibrations.

### Business Semantic States
- **Danger / Flagged / Breach (`#E11D48` / `#DC2626`):** Geo-fence breach, AIS spoofing, sanctions violation, machinery distress.
- **Warning / Anomalous / Under Review (`#F59E0B` / `#D97706`):** Weather advisory, route deviation, demurrage risk, bunkering delay.
- **Clear / Verified (`#10B981`):** Port clearance validated, customs accepted, route compliant.
- **Pending / Neutral (`#64748B`):** Telemetry ping awaiting ack, passive voyage leg, idle mooring.

## Typography

Typography enforces instantaneous scannability across dense data grids, telemetry readouts, and operational tree lists. 

### Typographic Hierarchy
1. **Space Grotesk (Widget Headers & Section Identifiers):** Employs geometric, technical grotesque shapes for widget titles, panel groupings, and voyage status summaries. Never sized above 20px to honor compact workspace restrictions.
2. **Inter (Body & Narrative Streams):** Delivers clean readability for situational narrative logs, policy clauses, surveyor summaries, and user commentary.
3. **JetBrains Mono (Data Points & Telemetry):** Used for IMO numbers, MMSI codes, latitude/longitude coordinates, speed over ground (SOG), course over ground (COG), UTC timestamps, and all tabular data values. Monospace alignment guarantees vertical numerical consistency across real-time streaming tables.

### Typesetting Rules
- All numeric data fields must use tabular figures with consistent decimal character widths.
- Section headers, metadata tags, and table column names are formatted in uppercase with slight positive letter spacing (`letterSpacing: 0.04em`) to establish visual separation from live row values.

## Layout & Spacing

Designed strictly for desktop workstations (resolutions from 1440x900 up to 4K multi-head control rooms). The layout operates on a compact 4px baseline rhythm.

### Grid & Structure
- **Host Integration:** Optimized for dynamic resizing within Palantir Workshop layout containers, grid sections, and flexible Slate frames.
- **Gutters & Dividers:** Tight 8px (`0.5rem`) gutters between visual cards prevent lost space. Where layout density demands, cards abut directly using shared 1px `#2B3545` borders instead of whitespace gaps.
- **Section Margins:** Bounded with 12px (`0.75rem`) outer container padding to maximize inner workspace acreage.

### Adaptive Flex Mechanics (Desktop Only)
- **1440px Viewport (Standard Consoles):** Primary filter bar docks horizontally across the top; master telemetry grid splits 60/40 with the object inspection pane.
- **1920px Viewport (Full HD Standard):** 3-column workstation layout: Vessel Selection List (280px fixed), Geospatial / Telemetry Deck (fluid center), Dossier & Inspector Module (420px fixed).
- **2560px+ (Operations Wall Display):** Multi-widget sync with persistent telemetry strip, expanded audit trail, and side-by-side scenario simulation comparators.

## Elevation & Depth

In keeping with tactical enterprise consoles, elevation is conveyed exclusively through **tonal layering** and **crisp 1px borders** rather than diffused drop shadows. This prevents screen visual clutter and eliminates GPU rendering lag when animating dense data tables or GIS overlays.

### Depth Stack
- **Floor (`#0E1217`):** Application base background.
- **Base Level (`#13171F`):** Standard widget backdrop with a 1px solid `#2B3545` border.
- **Elevated Level (`#1B212C`):** Object cards, active table rows, filter dropdown triggers, and docked toolbars.
- **Overlay Level (`#242C3B`):** Context menus, popover tooltips, voyage leg detail sheets, and filter flyouts. Framed with a 1px solid `#3E4C63` border for crisp visual separation.
- **Interactive Focus:** Keyboard-focused or currently selected items receive an inset or outer 1px accent ring colored with the corresponding canonical identity family (e.g., `#1164AF` for an active operational vessel).

## Shapes

The interface embraces a strictly sharp, zero-radius (`0px`) structural profile.

### Shape Architecture
- **Panels, Windows, and Cards:** Hard, straight 90-degree corners create clear visual compartments that align seamlessly with Foundry's native design tokens and Slate grid systems.
- **Controls & Buttons:** Sharp rectangles retain an instrumentation aesthetic reminiscent of naval radar panels and bridge equipment consoles.
- **Status Indicators & Badges:** Rendered as square chips or crisp rectangular labels with zero corner beveling, ensuring rapid recognition without superfluous softness.

## Components

### Buttons & Action Bars
- **Primary Action (Execution):** Background `#1164AF`, text `#F1F5F9`, border none. Hover state `#1772C6`. Active state `#0D4E89`. Font: `Inter` 12px/Medium, all-caps option for mission-critical actions. Height: 24px (compact) or 28px (default).
- **Secondary / Action Bar Item:** Background `#1B212C`, text `#CBD5E1`, 1px border `#2B3545`. Hover: background `#242C3B`, border `#3E4C63`.
- **Destructive Action:** Background transparent, text `#E11D48`, 1px border `#E11D48`. Hover: background `#E11D48` with text `#FFFFFF`.
- **Compound Action Bar:** Contiguous button groups bound by 1px `#2B3545` divisions, forming toolbars directly beneath the widget header.

### Status Chips & Semantic Badges
- **Structure:** Height: 18px. Padding: 0 6px. Font: `JetBrains Mono` 10px bold uppercase. 
- **States:**
  - *Danger / Flagged:* Background `#E11D48` with 15% opacity, text `#FB7185`, 1px border `#E11D48` with 40% opacity.
  - *Warning / Anomalous:* Background `#F59E0B` with 15% opacity, text `#FBBF24`, 1px border `#F59E0B` with 40% opacity.
  - *Clear / Verified:* Background `#10B981` with 15% opacity, text `#34D399`, 1px border `#10B981` with 40% opacity.
  - *Canonical Category Chips:* Background of respective canonical color at 15% opacity, matching solid foreground text and matching 1px border at 40% opacity.

### Workshop Filter Controls & Segmented Tabs
- **Filter Tabs:** Tab bars sit atop panels with a 1px border bottom (`#2B3545`). Inactive tabs display text `#94A3B8`. Active tab features text `#F1F5F9`, background `#1B212C`, and a 2px top accent line in the canonical color corresponding to that tab's functional context.
- **Facet Dropdowns:** Dense 22px height, slate `#13171F` background, 1px border `#2B3545`, trailing chevron icon, showing active filter count in a small `#242C3B` badge.

### Input Fields & Search Bars
- **Input Fields:** Background `#0E1217`, border 1px solid `#2B3545`, text `#F1F5F9`, placeholder `#64748B`. Focused state: border 1px solid `#1164AF` with zero glow. Height: 24px or 28px. Font: `JetBrains Mono` 11px.
- **Search Command Row:** Includes inline prefix monospaced tokens (e.g., `IMO:`, `CALLSIGN:`, `DEST:`) with dedicated clear (`ESC`) hints.

### Checkboxes & Radio Controls
- **Checkboxes:** 12px x 12px square, 0px border-radius. Inactive: border 1px solid `#64748B`, background transparent. Active: background `#1164AF`, border 1px solid `#1164AF`, sharp white SVG checkmark.
- **Radio Buttons:** 12px x 12px square (consistent with the zero-radius theme). Active state features a centered 6px solid square pip.

### Data Tables & Telemetry Grids
- **Header Row:** Background `#0E1217`, height 24px, text `#94A3B8`, font: `JetBrains Mono` 10px uppercase, letter spacing 0.04em, bottom border 1px solid `#2B3545`.
- **Data Rows:** Height 22px (dense) or 26px (standard). Alternating zebra rows (optional): `#13171F` and `#10141B`. Hover state: `#1B212C`. Active/Selected row: left border 2px solid `#1164AF`, background `#1B212C`.
- **Numerical Alignment:** Monospace font right-aligned, status codes centered, vessel names left-aligned.

### Object Cards & Dossier Manifests
- **Card Chassis:** Background `#13171F`, 1px solid border `#2B3545`, margin bottom 4px.
- **Header Strip:** Left 3px vertical status stripe (using Canonical or Semantic token), text `Space Grotesk` 13px bold, trailing timestamp in `JetBrains Mono` 10px.
- **Key-Value Matrix:** Structured grid inside card displaying parameters (Speed, Draught, Destination, ETA) with muted 10px uppercase labels directly stacked above 11px high-contrast monospace values.