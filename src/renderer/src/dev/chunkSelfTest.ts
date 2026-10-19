// Dev-only self-test harness for the chunk renderer.
// Run with: npm run dev, then open the window with ?selftest=chunks
// (dev builds only - main.tsx dead-code-eliminates this import in production).
//
// Renders a 2048px-equivalent region twice - once as a 2x2 grid of 1024px
// chunks via ChunkRenderer (flat pass), once as a single map of the same
// pixel size - then compares pixels: 20 sample points (mean per-channel
// diff < 2 required) and the seam column x=1024 +/- 1 for discontinuity.
//
// Regional verification run: bounds are a London crop, which yields
// exactly cols=2, rows=2 (actual 2048x1096, partial bottom row) and, since
// chunk centers now honor regional bounds origin (3912ae4), the rendered
// geography must be the requested crop - confirmed via a landmark-name
// probe over rendered features and the pixel comparison against the
// single-map reference centered on the same bounds.
import { Map as MaplibreMap } from 'maplibre-gl'
import type { ErrorEvent, StyleSpecification } from 'maplibre-gl'
import { lngLatToWorldPx, planChunks, worldPxToLngLat } from '../lib/chunkPlan'
import type { CropBounds } from '../lib/chunkPlan'
import { ChunkRenderer } from '../lib/chunkRenderer'
import { dataUrlToArrayBuffer } from '../lib/pngDataUrl'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const REGION: CropBounds = { west: -0.2, east: 0.1, south: 51.45, north: 51.55 }
const LANDMARK_PATTERN = /london|thames|westminster|piccadilly|oxford|camden|shoreditch|greenwich/i
const STEP_TIMEOUT_MS = 60_000

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

function onceMapEvent(map: MaplibreMap, event: 'load' | 'idle'): Promise<void> {
  return new Promise((resolve) => map.once(event, () => resolve()))
}

function meanChannelDiff(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  w: number,
  h: number,
  pick: (x: number, y: number) => number
): [number, number, number] {
  const sums = [0, 0, 0]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = pick(x, y) * 4
      sums[0] += Math.abs(a[o] - b[o])
      sums[1] += Math.abs(a[o + 1] - b[o + 1])
      sums[2] += Math.abs(a[o + 2] - b[o + 2])
    }
  }
  const n = w * h
  return [sums[0] / n, sums[1] / n, sums[2] / n]
}

function fmt(values: number[]): string {
  return values.map((v) => v.toFixed(3)).join('/')
}

export function mountChunkSelfTest(root: HTMLElement): void {
  root.innerHTML = ''
  root.style.cssText = 'padding:16px;font:12px/1.6 monospace;background:#0b1220;color:#e2e8f0'
  const pre = document.createElement('pre')
  pre.id = 'selftest-log'
  pre.style.whiteSpace = 'pre-wrap'
  root.appendChild(pre)
  const gallery = document.createElement('div')
  gallery.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-top:12px'
  root.appendChild(gallery)
  const log: Log = (msg) => {
    console.log(`[chunk-selftest] ${msg}`)
    pre.textContent += `${msg}\n`
  }
  log('chunk self-test starting...')
  runSelfTest(log, gallery)
    .then(() => log('DONE'))
    .catch((err: unknown) => {
      const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
      log(`FAILED: ${detail}`)
      console.error('[chunk-selftest] failed', err)
    })
}

function bitmapStats(label: string, bitmap: ImageBitmap, log: Log): void {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error(`2d context unavailable for ${label}`)
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const colors = new Set<string>()
  let transparent = 0
  let min = 255
  let max = 0
  const total = bitmap.width * bitmap.height
  const n = Math.min(total, 256 * 256)
  for (let k = 0; k < n; k++) {
    const p = (k * 7919) % total
    const o = p * 4
    if (data[o + 3] === 0) transparent++
    colors.add(`${data[o]},${data[o + 1]},${data[o + 2]},${data[o + 3]}`)
    min = Math.min(min, data[o], data[o + 1], data[o + 2])
    max = Math.max(max, data[o], data[o + 1], data[o + 2])
  }
  log(
    `${label}: ${bitmap.width}x${bitmap.height} distinctColors(sampled)=${colors.size} ` +
      `transparentFrac=${(transparent / n).toFixed(3)} rgbMin=${min} rgbMax=${max} ` +
      `firstColor=rgba(${data[0]},${data[1]},${data[2]},${data[3]})`
  )
}

function bytesEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false
  const va = new Uint8Array(a)
  const vb = new Uint8Array(b)
  for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return false
  return true
}

function logMapErrors(label: string, map: MaplibreMap, log: Log): void {
  let count = 0
  map.on('error', (e: ErrorEvent) => {
    if (count++ < 8) log(`${label} map error #${count}: ${e.error?.message ?? 'unknown'}`)
  })
}

async function runSelfTest(log: Log, gallery: HTMLElement): Promise<void> {
  log(`fetching style ${STYLE_URL}`)
  const style = (await withTimeout('fetch style', fetch(STYLE_URL).then((r) => r.json()))) as StyleSpecification

  const plan = planChunks(REGION, 2048, 1024)
  log(
    `plan: zoom=${plan.zoom.toFixed(4)} actual=${plan.actualWidth}x${plan.actualHeight} ` +
      `cols=${plan.cols} rows=${plan.rows} chunkPx=${plan.chunkPx} chunks=${plan.chunks.length} ` +
      `firstChunkLngLat=${plan.chunks[0]?.lng.toFixed(4)},${plan.chunks[0]?.lat.toFixed(4)}`
  )

  // --- chunk renders via ChunkRenderer --------------------------------------
  const renderer = new ChunkRenderer({ chunkPx: plan.chunkPx })
  const pngs = new Map<string, ArrayBuffer>()
  try {
    for (const chunk of plan.chunks) {
      const t0 = performance.now()
      const image = await withTimeout(
        `renderChunk ${chunk.col},${chunk.row}`,
        renderer.renderChunk(plan, chunk, { type: 'flat' }, {}, style)
      )
      pngs.set(`${chunk.col},${chunk.row}`, image.png)
      log(
        `chunk ${chunk.col},${chunk.row}: ${image.png.byteLength} bytes in ${Math.round(
          performance.now() - t0
        )}ms`
      )
    }
  } finally {
    renderer.destroy()
  }
  log('renderer destroyed (idempotency check: destroy() again)')
  renderer.destroy()

  // --- composite the 2x2 chunk pngs -----------------------------------------
  const composite = document.createElement('canvas')
  composite.width = plan.actualWidth
  composite.height = plan.actualHeight
  const cctx = composite.getContext('2d', { willReadFrequently: true })
  if (!cctx) throw new Error('composite 2d context unavailable')
  for (const chunk of plan.chunks) {
    const png = pngs.get(`${chunk.col},${chunk.row}`)
    if (!png) throw new Error(`missing chunk image ${chunk.col},${chunk.row}`)
    const bitmap = await withTimeout(
      `decode chunk ${chunk.col},${chunk.row}`,
      createImageBitmap(new Blob([png], { type: 'image/png' }))
    )
    bitmapStats(`chunk ${chunk.col},${chunk.row} decoded`, bitmap, log)
    cctx.drawImage(bitmap, chunk.centerX - plan.chunkPx / 2, chunk.centerY - plan.chunkPx / 2)
    bitmap.close()
  }
  const pngList = [...pngs.values()]
  log(`all chunk pngs byte-identical: ${pngList.every((p) => bytesEqual(pngList[0], p))}`)
  log('composite built from 2x2 chunk pngs')

  // --- reference: ONE map rendering the same region at the same size ---------
  const refContainer = document.createElement('div')
  refContainer.style.cssText =
    'position:fixed;left:-99999px;top:0;pointer-events:none;' +
    `width:${plan.actualWidth}px;height:${plan.actualHeight}px`
  document.body.appendChild(refContainer)
  const refOptions = {
    container: refContainer,
    style: JSON.parse(JSON.stringify(style)) as StyleSpecification,
    pitch: 0,
    maxPitch: 0,
    renderWorldCopies: false,
    attributionControl: false as const,
    pixelRatio: 1,
    preserveDrawingBuffer: true,
    canvasContextAttributes: { preserveDrawingBuffer: true }
  }
  const refMap = new MaplibreMap(refOptions)
  logMapErrors('reference', refMap, log)
  let refPng: ArrayBuffer
  let geographyNames: string[] = []
  try {
    await withTimeout('reference load', onceMapEvent(refMap, 'load'))
    const origin = lngLatToWorldPx(REGION.west, REGION.north, plan.zoom)
    const refCenter = worldPxToLngLat(
      origin.x + plan.actualWidth / 2,
      origin.y + plan.actualHeight / 2,
      plan.zoom
    )
    refMap.jumpTo({ center: [refCenter.lng, refCenter.lat], zoom: plan.zoom, bearing: 0, pitch: 0 })
    await withTimeout('reference idle', onceMapEvent(refMap, 'idle'))
    const renderedCenter = refMap.getCenter()
    const insideBounds =
      renderedCenter.lng >= REGION.west &&
      renderedCenter.lng <= REGION.east &&
      renderedCenter.lat >= REGION.south &&
      renderedCenter.lat <= REGION.north
    log(
      `geography: reference center=${renderedCenter.lng.toFixed(5)},${renderedCenter.lat.toFixed(5)} ` +
        `insideRequestedBounds=${insideBounds}`
    )
    for (const feature of refMap.queryRenderedFeatures()) {
      const name = (feature.properties as { name?: unknown } | undefined)?.name
      if (typeof name === 'string' && LANDMARK_PATTERN.test(name) && !geographyNames.includes(name)) {
        geographyNames.push(name)
        if (geographyNames.length >= 8) break
      }
    }
    log(`geography: landmark names rendered in reference: ${JSON.stringify(geographyNames)}`)
    refPng = dataUrlToArrayBuffer(refMap.getCanvas().toDataURL('image/png'))
  } finally {
    refMap.remove()
    refContainer.remove()
  }
  log(`reference map rendered: ${refPng.byteLength} bytes`)

  const refCanvas = document.createElement('canvas')
  refCanvas.width = plan.actualWidth
  refCanvas.height = plan.actualHeight
  const rctx = refCanvas.getContext('2d', { willReadFrequently: true })
  if (!rctx) throw new Error('reference 2d context unavailable')
  const refBitmap = await withTimeout('decode reference', createImageBitmap(new Blob([refPng], { type: 'image/png' })))
  bitmapStats('reference decoded', refBitmap, log)
  rctx.drawImage(refBitmap, 0, 0)
  refBitmap.close()

  for (const canvas of [composite, refCanvas]) {
    canvas.style.width = '500px'
    canvas.style.height = 'auto'
    canvas.style.outline = '1px solid #334155'
    gallery.appendChild(canvas)
  }

  // --- pixel comparison -------------------------------------------------------
  const w = plan.actualWidth
  const h = plan.actualHeight
  const a = cctx.getImageData(0, 0, w, h).data
  const b = rctx.getImageData(0, 0, w, h).data

  const samples: number[] = [0, 0, 0]
  let sampleCount = 0
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 5; i++) {
      const x = Math.round(((i + 0.5) / 5) * (w - 1))
      const y = Math.round(((j + 0.5) / 4) * (h - 1))
      const o = (y * w + x) * 4
      samples[0] += Math.abs(a[o] - b[o])
      samples[1] += Math.abs(a[o + 1] - b[o + 1])
      samples[2] += Math.abs(a[o + 2] - b[o + 2])
      sampleCount++
    }
  }
  const sampleMean = samples.map((s) => s / sampleCount)
  log(`20-sample mean abs diff per channel (RGB): ${fmt(sampleMean)}  [required < 2]`)

  const globalMean = meanChannelDiff(a, b, w, h, (x, y) => y * w + x)
  log(`global mean abs diff per channel (RGB): ${fmt(globalMean)}`)

  const seamX = plan.chunkPx
  const seamReport: Record<string, number[]> = {}
  for (const x of [seamX - 1, seamX, seamX + 1]) {
    const sums = [0, 0, 0]
    for (let y = 0; y < h; y++) {
      const o = (y * w + x) * 4
      sums[0] += Math.abs(a[o] - b[o])
      sums[1] += Math.abs(a[o + 1] - b[o + 1])
      sums[2] += Math.abs(a[o + 2] - b[o + 2])
    }
    seamReport[`x=${x}`] = sums.map((s) => s / h)
    log(`seam column x=${x} mean abs diff per channel (RGB): ${fmt(sums.map((s) => s / h))}`)
  }

  const gradAcross = (data: Uint8ClampedArray): [number, number, number] => {
    const sums = [0, 0, 0]
    for (let y = 0; y < h; y++) {
      const left = (y * w + (seamX - 1)) * 4
      const right = (y * w + (seamX + 2)) * 4
      sums[0] += Math.abs(data[right] - data[left])
      sums[1] += Math.abs(data[right + 1] - data[left + 1])
      sums[2] += Math.abs(data[right + 2] - data[left + 2])
    }
    return [sums[0] / h, sums[1] / h, sums[2] / h]
  }
  const gradComposite = gradAcross(a)
  const gradReference = gradAcross(b)
  const ratio = gradComposite.map((g, i) => g / Math.max(gradReference[i], 1e-6))
  log(
    `seam discontinuity (mean |p(x+3)-p(x-1)| across seam, RGB): composite=${fmt(gradComposite)} ` +
      `reference=${fmt(gradReference)} ratio=${fmt(ratio)}`
  )

  const samplesPass = sampleMean.every((m) => m < 2)
  const seamPass = ratio.every((r) => r < 2)
  const geographyPass = geographyNames.length > 0
  const verdict = samplesPass && seamPass && geographyPass ? 'PASS' : 'FAIL'
  log(
    `RESULT ${JSON.stringify({
      verdict,
      samplesPass,
      seamPass,
      geographyPass,
      geographyNames,
      bounds: REGION,
      plan: {
        zoom: plan.zoom,
        actualWidth: plan.actualWidth,
        actualHeight: plan.actualHeight,
        cols: plan.cols,
        rows: plan.rows,
        chunkPx: plan.chunkPx
      },
      sampleMean,
      globalMean,
      seamColumns: seamReport,
      seamGradient: { composite: gradComposite, reference: gradReference, ratio }
    })}`
  )
}
