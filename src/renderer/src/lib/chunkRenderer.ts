import { Map as MaplibreMap, setWorkerUrl } from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { applyPassMask } from './maskPasses'
import type { PassKind } from './maskPasses'
import type { Chunk, ChunkPlan } from './chunkPlan'
import { lngLatToWorldPx, worldPxToLngLat } from './chunkPlan'
import type { LayerMap } from './styleMap'
import { applyRequestCaps } from './mapOptions'
import { dataUrlToArrayBuffer } from './pngDataUrl'

setWorkerUrl(maplibreWorkerUrl)

export interface ChunkImage {
  col: number
  row: number
  png: ArrayBuffer
}

export interface ChunkRendererOptions {
  chunkPx: number
  pixelRatio?: number
}

const LOAD_TIMEOUT_MS = 60_000

export function waitForMapEvent(
  map: { once(event: 'load' | 'idle', cb: () => void): unknown; off(event: 'load' | 'idle', cb: () => void): unknown },
  event: 'load' | 'idle',
  signal?: AbortSignal,
  timeoutMs = LOAD_TIMEOUT_MS
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Export cancelled'))
      return
    }
    const cleanup = () => {
      clearTimeout(timer)
      map.off(event, onEvent)
      signal?.removeEventListener('abort', onAbort)
    }
    const onEvent = () => {
      cleanup()
      resolve()
    }
    const onAbort = () => {
      cleanup()
      reject(new Error('Export cancelled'))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`ChunkRenderer: map did not fire '${event}' within ${timeoutMs}ms`))
    }, timeoutMs)
    map.once(event, onEvent)
    signal?.addEventListener('abort', onAbort)
  })
}

function cloneStyle(style: StyleSpecification): StyleSpecification {
  return JSON.parse(JSON.stringify(style)) as StyleSpecification
}

export class ChunkRenderer {
  private readonly chunkPx: number
  private readonly pixelRatio: number
  private readonly cssPx: number
  private container: HTMLDivElement | null = null
  private map: MaplibreMap | null = null
  private creating: Promise<void> | null = null
  private lastPassKey: string | null = null

  constructor(opts: ChunkRendererOptions) {
    this.chunkPx = Math.max(1, Math.round(opts.chunkPx))
    this.pixelRatio = opts.pixelRatio ?? 1
    // MapLibre rounds container dimensions to whole CSS pixels. Render enough
    // pixels to cover a chunk, then trim the excess without resampling.
    this.cssPx = Math.ceil(this.chunkPx / this.pixelRatio)
  }

  async ensureStyle(style: StyleSpecification, signal?: AbortSignal): Promise<void> {
    if (this.creating) {
      await this.creating
    }
    if (this.map) {
      return
    }
    this.creating = this.createMap(style, signal)
    try {
      await this.creating
    } finally {
      this.creating = null
    }
  }

  private async createMap(style: StyleSpecification, signal?: AbortSignal): Promise<void> {
    const container = document.createElement('div')
    const css = container.style
    css.position = 'fixed'
    css.left = '-99999px'
    css.top = '0px'
    css.width = `${this.cssPx}px`
    css.height = `${this.cssPx}px`
    css.pointerEvents = 'none'
    document.body.appendChild(container)
    this.container = container

    const options = {
      container,
      style: cloneStyle(style),
      pitch: 0,
      maxPitch: 0,
      renderWorldCopies: false,
      attributionControl: false as const,
      pixelRatio: this.pixelRatio,
      interactive: false,
      trackResize: false,
      fadeDuration: 0,
      preserveDrawingBuffer: true,
      canvasContextAttributes: { preserveDrawingBuffer: true }
    }
    applyRequestCaps()

    let map: MaplibreMap
    try {
      map = new MaplibreMap(options)
    } catch (err) {
      container.remove()
      this.container = null
      throw err
    }
    this.map = map
    try {
      await waitForMapEvent(map, 'load', signal)
    } catch (err) {
      this.destroy()
      throw err
    }
  }

  async renderChunk(
    plan: ChunkPlan,
    chunk: Chunk,
    pass: PassKind,
    layerMap: LayerMap,
    style: StyleSpecification,
    signal?: AbortSignal
  ): Promise<ChunkImage> {
    await this.ensureStyle(style, signal)
    if (signal?.aborted) {
      throw new Error('Export cancelled')
    }
    const map = this.map
    if (!map) {
      throw new Error('ChunkRenderer: renderer was destroyed before renderChunk completed')
    }

    const passKey = pass.type === 'flat' ? 'flat' : `${pass.type}:${pass.groupId}`
    if (this.lastPassKey !== passKey) {
      const masked = applyPassMask(style, layerMap, pass)
      map.setStyle(masked, { diff: false })
      this.lastPassKey = passKey
    }
    // Keep the preview zoom so every zoom-dependent style property, visibility
    // threshold and source detail stays the same. Pixel density supplies the
    // extra resolution; scaling widths as well would thicken roads twice.
    const zoom = plan.zoom - Math.log2(this.pixelRatio)
    const centerPx = lngLatToWorldPx(chunk.lng, chunk.lat, plan.zoom)
    const excess = this.cssPx * this.pixelRatio - this.chunkPx
    const center = worldPxToLngLat(centerPx.x + excess / 2, centerPx.y + excess / 2, plan.zoom)
    map.jumpTo({ center: [center.lng, center.lat], zoom, bearing: 0, pitch: 0 })
    await waitForMapEvent(map, 'idle', signal)
    if (signal?.aborted) {
      throw new Error('Export cancelled')
    }

    const source = map.getCanvas()
    const expectedPx = Math.round(this.cssPx * this.pixelRatio)
    if (source.width !== expectedPx || source.height !== expectedPx) {
      throw new Error('ChunkRenderer: GPU could not render the requested export resolution')
    }
    const canvas = document.createElement('canvas')
    canvas.width = this.chunkPx
    canvas.height = this.chunkPx
    const context = canvas.getContext('2d')
    if (!context) throw new Error('ChunkRenderer: 2D canvas unavailable')
    context.drawImage(source, 0, 0, this.chunkPx, this.chunkPx, 0, 0, this.chunkPx, this.chunkPx)
    const png = dataUrlToArrayBuffer(canvas.toDataURL('image/png'))
    if (signal?.aborted) {
      throw new Error('Export cancelled')
    }
    return { col: chunk.col, row: chunk.row, png }
  }

  destroy(): void {
    this.lastPassKey = null
    const map = this.map
    this.map = null
    if (map) {
      try {
        map.remove()
      } catch {
        // Ignore cleanup errors if MapLibre was mid-load when aborted
      }
    }
    const container = this.container
    this.container = null
    if (container) {
      try {
        container.remove()
      } catch {
        // Ignore DOM removal errors
      }
    }
  }
}
