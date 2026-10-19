import { Map as MaplibreMap, setWorkerUrl } from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { applyPassMask } from './maskPasses'
import type { PassKind } from './maskPasses'
import type { Chunk, ChunkPlan } from './chunkPlan'
import type { LayerMap } from './styleMap'
import { dataUrlToArrayBuffer } from './pngDataUrl'

setWorkerUrl(maplibreWorkerUrl)

export interface ChunkImage {
  col: number
  row: number
  png: ArrayBuffer
}

export interface ChunkRendererOptions {
  chunkPx: number
}

const LOAD_TIMEOUT_MS = 60_000

function cloneStyle(style: StyleSpecification): StyleSpecification {
  return JSON.parse(JSON.stringify(style)) as StyleSpecification
}

function onceMapEvent(map: MaplibreMap, event: 'load' | 'idle'): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`ChunkRenderer: map did not fire '${event}' within ${LOAD_TIMEOUT_MS}ms`))
    }, LOAD_TIMEOUT_MS)
    map.once(event, () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

export class ChunkRenderer {
  private readonly chunkPx: number
  private container: HTMLDivElement | null = null
  private map: MaplibreMap | null = null
  private creating: Promise<void> | null = null

  constructor(opts: ChunkRendererOptions) {
    this.chunkPx = Math.max(1, Math.round(opts.chunkPx))
  }

  async ensureStyle(style: StyleSpecification): Promise<void> {
    if (this.creating) {
      await this.creating
    }
    if (this.map) {
      return
    }
    this.creating = this.createMap(style)
    try {
      await this.creating
    } finally {
      this.creating = null
    }
  }

  private async createMap(style: StyleSpecification): Promise<void> {
    const container = document.createElement('div')
    const css = container.style
    css.position = 'fixed'
    css.left = '-99999px'
    css.top = '0px'
    css.width = `${this.chunkPx}px`
    css.height = `${this.chunkPx}px`
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
      pixelRatio: 1,
      preserveDrawingBuffer: true,
      canvasContextAttributes: { preserveDrawingBuffer: true }
    }

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
      await onceMapEvent(map, 'load')
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
    style: StyleSpecification
  ): Promise<ChunkImage> {
    await this.ensureStyle(style)
    const map = this.map
    if (!map) {
      throw new Error('ChunkRenderer: renderer was destroyed before renderChunk completed')
    }

    const masked = applyPassMask(style, layerMap, pass)
    map.setStyle(masked, { diff: false })
    map.jumpTo({ center: [chunk.lng, chunk.lat], zoom: plan.zoom, bearing: 0, pitch: 0 })
    await onceMapEvent(map, 'idle')

    const png = dataUrlToArrayBuffer(map.getCanvas().toDataURL('image/png'))
    return { col: chunk.col, row: chunk.row, png }
  }

  destroy(): void {
    const map = this.map
    this.map = null
    if (map) {
      map.remove()
    }
    const container = this.container
    this.container = null
    if (container) {
      container.remove()
    }
  }
}
