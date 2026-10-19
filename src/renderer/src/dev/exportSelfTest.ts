// Dev-only export-pipeline self-test harness.
// Run with: npm run dev, then open the window with ?selftest=export
// (dev builds only - main.tsx dead-code-eliminates this import in production).
//
// Exercises the full Task 13 export flow against real infrastructure:
// exportEngine.runExport -> window.api IPC -> ExportSession -> sharp
// compositor / ag-psd assembly -> files on disk. Output paths are fixed so
// the file headers (PNG IHDR / PSD header) can be verified from a shell.
// The native save dialog and GUI interactions are intentionally bypassed.
import type { StyleSpecification } from 'maplibre-gl'
import { buildLayerMapFromStyle } from '../lib/layerMapBuilder'
import type { LayerMap } from '../lib/styleMap'
import { runExport } from '../lib/exportEngine'
import type { CropBounds } from '../lib/chunkPlan'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
// NOTE (2026-10-19): OpenFreeMap's current planet snapshot serves EMPTY tiles
// for z15+ (verified: `x-ofm-debug: empty tile` on London/Paris/NYC), so the
// harness uses a wide region whose planChunks zoom lands at ~12 where tile
// data exists. Street-level (z16+) exports are blocked upstream until their
// snapshot is repopulated - re-check before relying on this harness at high
// zoom.
const REGION: CropBounds = { west: -0.35, east: 0.05, south: 51.3, north: 51.65 }
const OUT_DIR = 'C:/Users/bdevl/AppData/Local/Temp/opencode/map-maker-selftest'
const STEP_TIMEOUT_MS = 240_000

type Log = (msg: string) => void

function withTimeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`self-test step '${label}' timed out after ${STEP_TIMEOUT_MS}ms`)),
      STEP_TIMEOUT_MS
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function limitedLayerMap(style: StyleSpecification): LayerMap {
  const full = buildLayerMapFromStyle(style)
  const layerMap: LayerMap = {}
  for (const id of ['water', 'buildings', 'road']) {
    const entry = full[id]
    if (entry && entry.fill.length + entry.casing.length + entry.labels.length > 0) {
      layerMap[id] = entry
    }
  }
  return layerMap
}

async function run(log: Log): Promise<void> {
  if (typeof window.api === 'undefined') {
    throw new Error('window.api unavailable - run this harness inside the Electron app')
  }
  const unsubscribe = window.api.onExportProgress((progress) => {
    log(`main progress: ${JSON.stringify(progress)}`)
  })

  try {
    log(`fetching style ${STYLE_URL}`)
    const style = (await withTimeout(
      'fetch style',
      fetch(STYLE_URL).then((r) => r.json())
    )) as StyleSpecification
    const layerMap = limitedLayerMap(style)
    log(`layer groups for layered pass: ${JSON.stringify(Object.keys(layerMap))}`)

    log(`flat PNG export: bounds=${JSON.stringify(REGION)} longEdge=3840 -> ${OUT_DIR}/selftest-flat.png`)
    await withTimeout(
      'flat export',
      runExport({
        bounds: REGION,
        longEdgePx: 3840,
        mode: 'flat',
        container: 'png-folder',
        style,
        layerMap,
        outPath: `${OUT_DIR}/selftest-flat.png`,
        attribution: true,
        onProgress: (done, total) => log(`flat render: ${done}/${total} chunks`),
        signal: new AbortController().signal,
      })
    )
    log('flat export finished')

    log(`layered PSD export: bounds=${JSON.stringify(REGION)} longEdge=2048 -> ${OUT_DIR}/selftest-layered.psd`)
    await withTimeout(
      'layered export',
      runExport({
        bounds: REGION,
        longEdgePx: 2048,
        mode: 'layered',
        container: 'psd',
        style,
        layerMap,
        outPath: `${OUT_DIR}/selftest-layered.psd`,
        attribution: true,
        onProgress: (done, total) => log(`layered render: ${done}/${total} chunk renders`),
        signal: new AbortController().signal,
      })
    )
    log('layered export finished')
  } finally {
    unsubscribe()
  }
}

export function mountExportSelfTest(root: HTMLElement): void {
  root.innerHTML = ''
  root.style.cssText = 'padding:16px;font:12px/1.6 monospace;background:#0b1220;color:#e2e8f0'
  const pre = document.createElement('pre')
  pre.id = 'selftest-log'
  pre.style.whiteSpace = 'pre-wrap'
  root.appendChild(pre)
  const log: Log = (msg) => {
    console.log(`[export-selftest] ${msg}`)
    pre.textContent += `${msg}\n`
  }
  log('export self-test starting...')
  run(log)
    .then(() => log('DONE'))
    .catch((err: unknown) => {
      const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
      log(`FAILED: ${detail}`)
      console.error('[export-selftest] failed', err)
    })
}
