---
Task ID: 1
Agent: main
Task: Reorganize Help into two subtabs (How It Works + Setup), remove "No waypoints" overlay, fix map scroll zoom

Work Log:
- Read current HelpGuide.tsx and MapPanel.tsx to assess state
- Confirmed "No waypoints yet" map overlay was already removed in previous session
- Fixed map scroll zoom: set wheelPxPerZoomLevel to 480, zoomDelta to 0.25, zoomSnap to 0.25 (was 180/1/0.5) for much smoother per-tick zooming
- Rewrote HelpGuide.tsx with two subtabs: "How It Works" (architecture, simulation, connect, waypoints, flight controls) and "Setup" (9 sections: parts, software, install, firmware, wiring, calibration, first flight, network, safety)
- Removed ESP32-specific content from "How It Works" tab (firmware flash + wiring steps) since those are in the dedicated ESP32 tab and duplicated in the Setup tab
- Browser verified: both subtabs render correctly, no console errors, no map overlay, HMR connected

Stage Summary:
- Map zoom now much smoother (480px per zoom level vs 180, delta 0.25 vs 1)
- Help section now has clean "How It Works" / "Setup" subtab switcher
- Setup tab has 9 comprehensive sections including new Calibration, First Flight Checklist, and Safety Warnings
- No ESP32 duplication between Help tabs
- Lint clean, no console errors

---
Task ID: 2
Agent: main
Task: Complete UI layout redesign + README + Windows compatibility

Work Log:
- Created comprehensive README.md with Windows-focused setup guide (7 steps, hardware table, wiring, troubleshooting)
- Fixed build script: removed Unix-only `cp -r`, simplified to `next build` / `next start`
- Added `bun run setup` command that auto-creates db folder cross-platform
- Removed "Software Required" and "Install & Run" sections from Help Setup tab (now in README)
- Completely redesigned layout from 3-column to professional GCS style:
  - Header: Two-row design — brand/status row + horizontal telemetry strip (GPS, BAT, ALT, SPD, HDG)
  - Left sidebar: Collapsible, resizable (20% default, 0-28%), contains Connection + Telemetry + Flight Controls
  - Center: Full-width map (hero element, 65% default height)
  - Bottom panel: Resizable, collapsible (35% default, 0-60%), tabbed (Mission/Logs/ESP32/Camera/Help)
  - Mobile: Bottom nav bar (Map/Mission/Logs/ESP32/Help) + Controls sheet trigger
- Redesigned DroneHeader: amber accent icon, backdrop blur, inline status badges, telemetry stat strip with separators
- Redesigned TelemetryPanel: compact cards with Progress bar for battery, tighter spacing, muted backgrounds
- Redesigned ConnectionPanel: combined connection+controls into two compact cards, E-Stop has red border accent
- Added imperative panel handles for programmatic collapse/expand
- Browser verified: desktop (1920x1080) and mobile (375x812), all tabs work, sidebar collapse works, no errors

Stage Summary:
- Professional GCS layout with resizable panels (react-resizable-panels)
- Map is now the dominant element — no more cramped right sidebar
- Bottom panel gives Mission/Logs more horizontal space for waypoint lists and log entries
- Mobile has proper bottom navigation bar instead of inline tab buttons
- Header telemetry strip shows key data at a glance without opening sidebar
- README.md ready for public release with Windows/Mac/Linux instructions