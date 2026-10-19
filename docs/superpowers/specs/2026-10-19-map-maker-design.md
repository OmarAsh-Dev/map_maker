# map_maker — v1 Design

Date: 2026-10-19
Status: approved by product owner (chat); builder check resolved; ready for planning

## Intent and why

A Windows desktop app for making high-resolution map images to use in **After Effects**. The product owner animates maps in AE: a flat still to pan/zoom across, or layered artwork whose parts (roads, water, labels) move independently. Existing tools (mapbuilder.app) are web-based, Google-tiled, and cap export size. map_maker replicates the mapbuilder.app editing experience with two changes: tiles come from **OpenFreeMap** (free, no key), and exports go up to **16k** with a layered mode that produces AE-ready files.

Reference product: <https://mapbuilder.app/map> — the UI should feel immediately familiar to its users.

## Goals (v1)

1. **Style the map** with a feature-tree sidebar:
   - Top-level groups: Administrative, Landscape, Buildings, Points of interest, Road, Transit, Water, Background.
   - Each group expands to sub-items (e.g. Road → Highway, Arterial, Minor, Service, Street limits, Path, Others).
   - Every row has a color swatch and a visibility (eye) toggle.
   - Selecting a category opens a detail panel with three sections, matching the reference screenshots:
     - **Geometry**: Fill color, Stroke color, Opacity slider.
     - **Label text**: Fill color, Stroke color, Opacity slider.
     - **Label icon**: Color.
   - Each section has its own eye toggle. When sub-items disagree on a value, the parent shows a "Mixed" state.
2. **Crop** by dragging a rectangle directly on the map (adjustable afterwards).
3. **Export** from a dialog:
   - Mode: **Flat** (one image) or **Layered** (one full-size transparent image per layer group).
   - Flat format: PNG.
   - Layered container: **PSD** (opens in AE as layers; default) or folder of transparent PNGs (fallback toggle).
   - Layer structure: each top-level category exports as **two layers — geometry and labels** (e.g. "Roads" and "Roads labels"). Labels are placed once with global collision so the result matches the screen exactly, then assigned to their parent category's label layer. Hiding a category hides its geometry and its labels together.
   - Size: presets 1080p / 4K / 8K / 16K plus custom; cap long edge at 16,384 px; optional aspect-ratio locks (16:9, 9:16, 1:1, free).
   - Output must match what the on-screen map shows at that zoom.
4. **Rendering** stitches map tiles offscreen in chunks so 16k output works regardless of GPU max texture size, with a progress bar and cancel.
5. **Presets**: save and load the current style locally as JSON.
6. **Attribution**: included by default; removable after an explicit warning dialog stating that OSM's license (ODbL) and OpenFreeMap's terms require attribution in published media including video, and that removing it is the user's responsibility.

## Camera (v1)

The map view is **strictly top-down**: pitch is locked at 0 (product owner confirmed). Bearing rotation is allowed — it stitches seam-free. This keeps 16k stitched exports geometrically exact.

## Non-goals (v1)

- Overlays: markers, polylines, routes, shapes, text, CSV/KML/GeoJSON import — planned as the first update after v1.
- Satellite or terrain raster basemaps (OpenFreeMap is vector-only; free satellite sources are not cleanly licensed).
- Accounts, cloud sync, sharing, collaboration, purchases.
- Label language switching (the "EN" pill in the reference).
- Auto-updater, telemetry, crash reporting.
- Code signing (product owner confirmed: ship unsigned; users see a one-time SmartScreen prompt).

## Anti-goals

- A full GIS editor.
- Any server component or installer experience — the deliverable is a zip the user unzips and runs.

## Constraints

- **Tiles**: OpenFreeMap only. No API key, no registration — never add one or ask the user for one. Vector tiles rendered with **MapLibre GL JS**; styles are URLs like `https://tiles.openfreemap.org/styles/liberty`. Feature editing happens through the MapLibre style spec (layers / paint properties), not raster recoloring.
- **Stack** (decided): React + TypeScript + Tailwind CSS in Electron; Windows 10/11 x64.
- **Deliverable**: `electron-builder` with the **zip** target (NSIS disabled) — a zip containing the standalone **unsigned** exe (product owner confirmed; users see a one-time SmartScreen prompt).
- **License**: OSM data is ODbL; attribution must be offered (see Goals #6).

## Decisions the product owner made

| Decision | Choice |
| --- | --- |
| Purpose | Maps for After Effects compositions |
| Export modes | Both flat and layered |
| Style editing | Category tree + detail panel, exactly like mapbuilder.app (screenshots provided) |
| v1 scope | Style the map, crop, export — nothing else |
| Packaging | Zip containing the exe; no installer |
| Layered labels | Labels export with their category (geometry + labels sub-layers) |
| Camera | Top-down only; pitch locked at 0 |
| Attribution removal | Warning + accept; user assumes ODbL obligation |
| Code signing | Ship unsigned; one-time SmartScreen prompt accepted |

## Calls made by the designer (veto welcome)

- PSD written with `ag-psd`; PNG folder mode reuses the same per-group renders. Fall back to **PSB** (AE-compatible) when a multi-layer 16k file would exceed classic PSD limits.
- Presets stored as JSON in the user's app-data directory.
- Build tooling: Vite (renderer) + electron-builder (packaging).
- Default basemap: OpenFreeMap `liberty`; its other hosted styles (Bright, Positron, Dark, Fiord, …) selectable as basemap presets.
- No auto-updater; new versions are new zips.

## Left to the builder

- The mapping table from OpenFreeMap style layers (per style) to the category tree and sub-items, including which style-spec properties back Fill / Stroke / Opacity / Label sections.
- Tile-stitch rendering: chunk math, seam consistency (labels and road casing across chunk boundaries), memory strategy (a 16k RGBA canvas is ~1 GiB per layer; layered PSD assembly must be chunked).
- Electron process architecture (main/renderer split, IPC for file dialogs and export pipeline), folder structure, state management, and test framework.
- PSD layer ordering and naming so the AE import is immediately usable; fall back to PSB (AE-compatible) if a 16k multi-layer file exceeds classic PSD limits.
- Tile fetching etiquette per OpenFreeMap ToS: conservative caps (≈4 parallel requests), disk cache, and a User-Agent identifying the app (e.g. `map_maker/0.1`).
- Exact attribution string and placement.
