# Map Maker

<p align="center">
  <img src="build/icon.png" width="96" height="96" alt="Map Maker Logo" />
</p>

A Windows desktop map customizer and high-resolution exporter — a desktop take on [mapbuilder.app](https://mapbuilder.app/map), built on **OpenFreeMap** tiles (free, no API key) with **all map features editable** and exports up to **32k**, designed for After Effects workflows.

## Features

- **Style every feature category** — Administrative, Landscape, Buildings, Points of interest, Road, Transit, Water, Background — each with fill/stroke/opacity and label text/icon controls, plus per-category visibility (matches the mapbuilder editing model)
- **Labels master toggle** — hide every label layer at once
- **Basemap switcher** — Liberty (default), Bright, Positron, Dark, Fiord, all hosted by OpenFreeMap
- **Presets** — save/load your style locally as JSON
- **Crop & export** — drag a rectangle on the map (with 8 resize handles, drag-to-move, and live pixel dimensions), pick 1080p / 4K / 8K / 16K / 32K (or custom, capped at 32,768 px), optional 16:9 / 9:16 / 1:1 ratio locks
- **Two export modes**
  - **Flat** — one PNG
  - **Layered** — After Effects-ready PSD / PSB (or a folder of transparent PNGs) with each category as geometry + labels layers, ordered bottom→top like the map
- **WYSIWYG exports** — line widths, text and icon sizes are scaled by the export/view ratio so the output proportions match what you see in the app
- **Attribution** — © OpenStreetMap contributors burned in by default; removable after an explicit license warning
- Up to 32k exports are tile-stitched offscreen in chunks, so they work on any GPU, with progress and cancel

## Stack

| Layer | Choice |
| --- | --- |
| Shell | Electron (electron-vite) |
| UI | React 18 + TypeScript + Tailwind CSS v4 |
| Map | MapLibre GL JS + OpenFreeMap vector tiles |
| State | zustand |
| Export imaging | sharp (compositing) + ag-psd/node-canvas (PSD/PSB) |
| Tests | Vitest + Testing Library |
| Packaging | electron-builder → **zip containing a standalone unsigned exe** (no installer) |

## Commands

```bash
npm run dev        # dev app with HMR
npm run build      # build to out/
npm test           # vitest suite
npm run typecheck  # tsc on web + node configs
npm run dist       # build + package → release/Map Maker-<version>-win.zip
```

## Project layout

```
src/main/       Electron main process (window, IPC, export session, compositor, PSD, presets)
src/preload/    contextBridge API (window.api)
src/renderer/   React app (map, sidebar, export dialog, style engine, chunk renderer)
build/          App icon assets (icon.svg, icon.png, icon.ico)
resources/      Runtime window icon assets
docs/superpowers/specs/  v1 design spec (approved)
docs/superpowers/plans/  v1 & v1.1–v2.0 implementation plans
```

## Notes

- **No API key, ever** — OpenFreeMap is free and keyless. Tile source max zoom is 14; smaller crops exported very large derive higher zooms and are upscaled (the export dialog warns when this happens).
- The exe ships unsigned — Windows shows a one-time SmartScreen prompt.
- OSM data is ODbL-licensed: keep attribution in published work.
- See `AGENTS.md` for agent-facing conventions and machine quirks.
