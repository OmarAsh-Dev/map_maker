# map_maker

## What this is

Desktop clone of [mapbuilder.app/map](https://mapbuilder.app/map) — a map customizer and high-resolution exporter — with two differences:

- **Tiles from OpenFreeMap** (not Google/OpenMapTiles).
- **All map features are editable**, and the crop/export area supports **up to 16k** output.

Users style/recolor map features, add overlays (markers, lines, shapes, text), drag-select a region, and export a high-resolution image. Final deliverable is a **Windows .exe**.

## Stack (decided, not yet scaffolded)

- React + TypeScript + Tailwind CSS, running in Electron
- Packaging target: Windows executable
- **The repo is currently empty** — no `package.json`, no build commands, no scaffold exists yet. First task is scaffolding the Electron app. Update this file with real commands (`dev`, `build`, `test`) once `package.json` exists.

## Tile source: OpenFreeMap

- Free vector tile host — **no API key, no registration, no per-request cost**. Do not add a key or ask the user for one.
- Works with MapLibre GL JS; styles are URLs like `https://tiles.openfreemap.org/styles/liberty`. If a tile request 404s, check the style URL first.
- Feature editing happens through the MapLibre **style spec** (layers/paint properties), not raster recoloring — "edit all map features" means exposing style-spec layer properties.

## Conventions

- None established yet. Don't invent folder structures silently — propose a scaffold and let the user confirm.
