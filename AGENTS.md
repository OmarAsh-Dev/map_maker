# map_maker

## What this is

Desktop clone of [mapbuilder.app/map](https://mapbuilder.app/map) — a map customizer and high-resolution exporter — with two differences:

- **Tiles from OpenFreeMap** (not Google/OpenMapTiles).
- **All map features are editable**, and the crop/export area supports **up to 16k** output.

Users style/recolor map features, add overlays (markers, lines, shapes, text), drag-select a region, and export a high-resolution image. Final deliverable is a **Windows .exe**.

## Stack

- React + TypeScript + Tailwind CSS v4, running in Electron (electron-vite scaffold)
- Packaging target: Windows executable (electron-builder, zip target)

## Commands

- `npm run dev` — Electron dev with HMR (vite dev server + Electron)
- `npm run build` — electron-vite build, emits `out/`
- `npm test` — vitest run (jsdom via per-file `// @vitest-environment jsdom` header)
- `npm run typecheck` — `tsc --noEmit` on `tsconfig.web.json` + `tsconfig.node.json`
- `npm run dist` — electron-vite build + electron-builder --win → zip in `release/`

npm on this machine runs an `allow-scripts` policy (non-strict): install scripts not on the allowlist are skipped with a warning. Electron's binary is installed by running `node node_modules/electron/install.js` manually if `node_modules/electron/dist` is missing after a fresh install.

## Tile source: OpenFreeMap

- Free vector tile host — **no API key, no registration, no per-request cost**. Do not add a key or ask the user for one.
- Works with MapLibre GL JS; styles are URLs like `https://tiles.openfreemap.org/styles/liberty`. If a tile request 404s, check the style URL first.
- Feature editing happens through the MapLibre **style spec** (layers/paint properties), not raster recoloring — "edit all map features" means exposing style-spec layer properties.

## Conventions

- Scaffold: `src/main`, `src/preload`, `src/renderer` (electron-vite), tests colocated as `*.test.ts(x)`, built output in `out/`, packaged artifacts in `release/`.
- Tests use vitest with jsdom enabled per-file via a `// @vitest-environment jsdom` header comment.
- Don't add new top-level folders or dependencies without confirming.
