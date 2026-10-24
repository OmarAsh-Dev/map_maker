import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StyleSpecification } from 'maplibre-gl'
import { readPsd } from 'ag-psd'
import sharp from 'sharp'
import { planChunks } from './chunkPlan'
import type { Chunk, ChunkPlan, CropBounds } from './chunkPlan'
import type { LayerMap } from './styleMap'
import type { PassKind } from './maskPasses'
import { exportScaleFactor, runExport } from './exportEngine'
import type { ExportChunkImage, ExportRenderer } from './exportEngine'
import { ExportSession } from '../../../main/export/exportSession'
import type { ExportJobSpec } from '../../../main/export/exportSession'

const fakeApi = {
  beginExport: vi.fn(),
  sendChunk: vi.fn(),
  finishExport: vi.fn(async () => {}),
  cancelExport: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { api: fakeApi })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'water-fill', type: 'fill', paint: { 'fill-color': '#1191bd' } },
    { id: 'water-label', type: 'symbol', paint: { 'text-color': '#22506b' } },
    {
      id: 'road-highway',
      type: 'line',
      paint: { 'line-color': '#e892a2', 'line-width': 2 },
      layout: { 'line-join': 'round' },
    },
    {
      id: 'road-highway-label',
      type: 'symbol',
      paint: { 'text-color': '#333333', 'text-halo-width': 1.5 },
      layout: { 'text-size': 12 },
    },
  ],
} as unknown as StyleSpecification

const LAYER_MAP: LayerMap = {
  water: { fill: ['water-fill'], casing: [], labels: ['water-label'] },
  road: { fill: ['road-highway'], casing: [], labels: ['road-highway-label'] },
}

const BASE_BOUNDS: CropBounds = { west: 0, south: 0, east: 1, north: 1 }

function createFakeRenderer() {
  const calls: { pass: PassKind; col: number; row: number }[] = []
  const renderChunk = vi.fn(
    async (_plan: ChunkPlan, chunk: Chunk, pass: PassKind): Promise<ExportChunkImage> => {
      calls.push({ pass, col: chunk.col, row: chunk.row })
      return { col: chunk.col, row: chunk.row, png: new ArrayBuffer(8) }
    }
  )
  const renderer: ExportRenderer = {
    ensureStyle: vi.fn(async () => {}),
    renderChunk,
    destroy: vi.fn(),
  }
  return { renderer, calls, renderChunk }
}

function baseOpts(overrides?: Partial<Parameters<typeof runExport>[0]>) {
  return {
    bounds: BASE_BOUNDS,
    longEdgePx: 4096,
    mode: 'flat' as const,
    container: 'png-folder' as const,
    style: STYLE,
    layerMap: LAYER_MAP,
    outPath: 'C:/out/map.png',
    attribution: true,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    ...overrides,
  }
}

describe('runExport', () => {
  it('flat mode renders one flat pass over all chunks in row-major order', async () => {
    const { renderer, calls } = createFakeRenderer()
    const onProgress = vi.fn()

    await runExport(baseOpts({ renderer, onProgress }))

    const plan = planChunks(BASE_BOUNDS, 4096)
    expect(calls).toHaveLength(plan.chunks.length)
    expect(calls.every((call) => call.pass.type === 'flat')).toBe(true)
    expect(calls.map((call) => `${call.col},${call.row}`)).toEqual(
      plan.chunks.map((chunk) => `${chunk.col},${chunk.row}`)
    )
    expect(fakeApi.beginExport).toHaveBeenCalledTimes(1)
    expect(fakeApi.beginExport.mock.calls[0][0]).toMatchObject({
      mode: 'flat',
      container: 'png-folder',
      cols: plan.cols,
      rows: plan.rows,
      chunkPx: plan.chunkPx,
      actualWidth: plan.actualWidth,
      actualHeight: plan.actualHeight,
      outWidth: plan.actualWidth,
      outHeight: plan.actualHeight,
      outPath: 'C:/out/map.png',
      groups: [],
    })
    expect(fakeApi.sendChunk.mock.calls.map((call) => call[0])).toEqual(
      plan.chunks.map(() => 'Flat')
    )
    expect(fakeApi.sendChunk.mock.calls[0][3]).toBeInstanceOf(ArrayBuffer)
    expect(fakeApi.finishExport).toHaveBeenCalledTimes(1)
    expect(renderer.destroy).toHaveBeenCalledTimes(1)
    expect(onProgress.mock.calls).toEqual(
      Array.from({ length: plan.chunks.length + 1 }, (_, index) => [index, plan.chunks.length])
    )
  })

  it('layered mode renders pass-major: per group bottom→top, geometry over all chunks then labels over all chunks', async () => {
    const { renderer, calls } = createFakeRenderer()
    const onProgress = vi.fn()

    await runExport(baseOpts({ renderer, onProgress, mode: 'layered', container: 'psd' }))

    const plan = planChunks(BASE_BOUNDS, 4096)
    const chunkOrder = plan.chunks.map((chunk) => `${chunk.col},${chunk.row}`)
    const expected = [
      ...chunkOrder.map((c) => `geometry:water@${c}`),
      ...chunkOrder.map((c) => `labels:water@${c}`),
      ...chunkOrder.map((c) => `geometry:road@${c}`),
      ...chunkOrder.map((c) => `labels:road@${c}`),
    ]
    expect(
      calls.map(
        (call) =>
          `${call.pass.type}:${'groupId' in call.pass ? call.pass.groupId : ''}@${call.col},${call.row}`
      )
    ).toEqual(expected)

    const total = 4 * plan.chunks.length
    expect(onProgress.mock.calls[0]).toEqual([0, total])
    expect(onProgress.mock.calls[onProgress.mock.calls.length - 1]).toEqual([total, total])
    expect(onProgress).toHaveBeenCalledTimes(total + 1)

    expect(fakeApi.sendChunk.mock.calls.map((call) => call[0])).toEqual([
      ...chunkOrder.map(() => 'Water'),
      ...chunkOrder.map(() => 'Water labels'),
      ...chunkOrder.map(() => 'Road'),
      ...chunkOrder.map(() => 'Road labels'),
    ])
    expect(fakeApi.beginExport.mock.calls[0][0]).toMatchObject({
      mode: 'layered',
      container: 'psd',
      groups: [
        { id: 'water', label: 'Water' },
        { id: 'water', label: 'Water labels' },
        { id: 'road', label: 'Road' },
        { id: 'road', label: 'Road labels' },
      ],
    })
    expect(fakeApi.finishExport).toHaveBeenCalledTimes(1)
    expect(renderer.destroy).toHaveBeenCalledTimes(1)
  })

  it('sends no chunks and still finishes when layered export has no visible groups', async () => {
    const { renderer, calls } = createFakeRenderer()
    const emptyLayerMap: LayerMap = {}

    await runExport(baseOpts({ renderer, mode: 'layered', layerMap: emptyLayerMap }))

    expect(calls).toHaveLength(0)
    expect(fakeApi.beginExport).toHaveBeenCalledTimes(1)
    expect(fakeApi.beginExport.mock.calls[0][0]).toMatchObject({ groups: [] })
    expect(fakeApi.sendChunk).not.toHaveBeenCalled()
    expect(fakeApi.finishExport).toHaveBeenCalledTimes(1)
    expect(renderer.destroy).toHaveBeenCalledTimes(1)
  })

  it('aborts between chunks, destroys the renderer, and never finishes', async () => {
    const { renderer, calls, renderChunk } = createFakeRenderer()
    const controller = new AbortController()
    let rendered = 0
    ;(renderChunk as Mock).mockImplementation(
      async (_plan: ChunkPlan, chunk: Chunk, pass: PassKind): Promise<ExportChunkImage> => {
        rendered += 1
        if (rendered === 2) controller.abort()
        calls.push({ pass, col: chunk.col, row: chunk.row })
        return { col: chunk.col, row: chunk.row, png: new ArrayBuffer(8) }
      }
    )

    await expect(
      runExport(baseOpts({ renderer, signal: controller.signal }))
    ).rejects.toThrow(/cancel/i)

    expect(calls).toHaveLength(2)
    expect(fakeApi.sendChunk).toHaveBeenCalledTimes(2)
    expect(fakeApi.finishExport).not.toHaveBeenCalled()
    expect(fakeApi.cancelExport).not.toHaveBeenCalled()
    expect(renderer.destroy).toHaveBeenCalledTimes(1)
  })

  it('rejects without beginning or rendering when the signal is already aborted', async () => {
    const { renderer } = createFakeRenderer()
    const controller = new AbortController()
    controller.abort()

    await expect(
      runExport(baseOpts({ renderer, signal: controller.signal }))
    ).rejects.toThrow(/cancel/i)

    expect(fakeApi.beginExport).not.toHaveBeenCalled()
    expect(fakeApi.cancelExport).not.toHaveBeenCalled()
    expect(renderer.renderChunk).not.toHaveBeenCalled()
    expect(fakeApi.finishExport).not.toHaveBeenCalled()
  })

  it('cancels the dangling main-side session when rendering fails mid-export', async () => {
    const { renderer, renderChunk } = createFakeRenderer()
    ;(renderChunk as Mock).mockRejectedValue(new Error('render exploded'))

    await expect(runExport(baseOpts({ renderer }))).rejects.toThrow(/render exploded/)

    expect(fakeApi.beginExport).toHaveBeenCalledTimes(1)
    expect(fakeApi.cancelExport).toHaveBeenCalledTimes(1)
    expect(fakeApi.finishExport).not.toHaveBeenCalled()
    expect(renderer.destroy).toHaveBeenCalledTimes(1)
  })

  it('cancels the main-side session when finishExport rejects without a main error event', async () => {
    const { renderer } = createFakeRenderer()
    fakeApi.finishExport.mockRejectedValueOnce(new Error('unexpected main failure'))

    await expect(runExport(baseOpts({ renderer }))).rejects.toThrow(/unexpected main failure/)

    expect(fakeApi.cancelExport).toHaveBeenCalledTimes(1)
    expect(renderer.destroy).toHaveBeenCalledTimes(1)
  })

  it('maps the attribution flag to the standard string or null in the export spec', async () => {
    const { renderer } = createFakeRenderer()

    await runExport(baseOpts({ renderer, attribution: true }))
    expect(fakeApi.beginExport.mock.calls[0][0]).toMatchObject({
      attribution: '© OpenStreetMap contributors',
    })

    await runExport(baseOpts({ renderer, attribution: false }))
    expect(fakeApi.beginExport.mock.calls[1][0]).toMatchObject({ attribution: null })
  })

  it('streams the real pass sequence through a real ExportSession into a complete layered PSD', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'map-maker-engine-'))
    try {
      const outPath = join(dir, 'map.psd')
      const colors: Record<string, [number, number, number]> = {
        'geometry:water': [10, 30, 200],
        'labels:water': [220, 40, 50],
        'geometry:road': [15, 170, 70],
        'labels:road': [250, 205, 30],
      }
      let session: ExportSession | null = null
      const routedApi = {
        beginExport: (spec: ExportJobSpec) => {
          session = new ExportSession(spec, () => {})
        },
        sendChunk: (label: string, col: number, row: number, png: ArrayBuffer) => {
          void session?.addChunk(label, { col, row, png: Buffer.from(png) })
        },
        finishExport: async () => {
          if (!session) throw new Error('no active session')
          await session.finish()
        },
        cancelExport: () => session?.cancel(),
      }
      vi.stubGlobal('window', { api: routedApi })

      const renderer: ExportRenderer = {
        ensureStyle: async () => {},
        renderChunk: async (plan, chunk, pass) => {
          const key = `${pass.type}:${'groupId' in pass ? pass.groupId : ''}`
          const [r, g, b] = colors[key]
          const png = await sharp({
            create: {
              width: plan.chunkPx,
              height: plan.chunkPx,
              channels: 4,
              background: { r, g, b, alpha: 1 },
            },
            limitInputPixels: false,
          })
            .png()
            .toBuffer()
          return {
            col: chunk.col,
            row: chunk.row,
            png: png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer,
          }
        },
        destroy: () => {},
      }

      await runExport(
        baseOpts({
          renderer,
          mode: 'layered',
          container: 'psd',
          longEdgePx: 256,
          outPath,
          attribution: false,
        })
      )

      const psd = readPsd(await readFile(outPath), { useImageData: true })
      expect(psd.children!.map((child) => child.name)).toEqual([
        'Road labels',
        'Road',
        'Water labels',
        'Water',
      ])
      for (const child of psd.children!) {
        expect(child.imageData).toBeDefined()
        expect(child.imageData!.data.length).toBeGreaterThan(0)
      }
      const pixelOf = (name: string): [number, number, number] => {
        const child = psd.children!.find((entry) => entry.name === name)!
        const data = child.imageData!.data as Uint8Array
        const i = (Math.floor(child.imageData!.height / 2) * child.imageData!.width +
          Math.floor(child.imageData!.width / 2)) * 4
        return [data[i], data[i + 1], data[i + 2]]
      }
      expect(pixelOf('Water')).toEqual([10, 30, 200])
      expect(pixelOf('Water labels')).toEqual([220, 40, 50])
      expect(pixelOf('Road')).toEqual([15, 170, 70])
      expect(pixelOf('Road labels')).toEqual([250, 205, 30])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('wysiwyg style scaling', () => {
  it('preserves the preview style instead of multiplying zoom-dependent widths again', async () => {
    const { renderer, renderChunk } = createFakeRenderer()
    const plan = planChunks(BASE_BOUNDS, 4096)
    const cropZoom = plan.zoom - 1 // exactly one zoom level below the derived zoom
    await runExport(baseOpts({ renderer, cropZoom }))

    expect(renderChunk).toHaveBeenCalled()
    const passedStyle = (renderChunk.mock.calls[0] as unknown[])[4] as {
      layers: Array<{ id: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }>
    }
    const road = passedStyle.layers.find((l) => l.id === 'road-highway')!
    const label = passedStyle.layers.find((l) => l.id === 'road-highway-label')!
    expect(road.paint!['line-width']).toBe(2)
    expect(label.paint!['text-halo-width']).toBe(1.5)
    expect(label.layout!['text-size']).toBe(12)
    expect(passedStyle).toEqual(STYLE)
  })

  it('scales style px properties via scaleStyleForExport when export/view ratio exceeds MAX_PIXEL_RATIO (4)', async () => {
    const { renderer, renderChunk } = createFakeRenderer()
    const plan = planChunks(BASE_BOUNDS, 4096)
    const cropZoom = plan.zoom - 3 // factor = 2^3 = 8 -> deviceRatio = 4, styleScale = 2
    await runExport(baseOpts({ renderer, cropZoom }))

    expect(renderChunk).toHaveBeenCalled()
    const passedStyle = (renderChunk.mock.calls[0] as unknown[])[4] as {
      layers: Array<{ id: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }>
    }
    const road = passedStyle.layers.find((l) => l.id === 'road-highway')!
    const label = passedStyle.layers.find((l) => l.id === 'road-highway-label')!
    expect(road.paint!['line-width']).toBe(4)
    expect(label.paint!['text-halo-width']).toBe(3)
    expect(label.layout!['text-size']).toBe(24)
  })

  it('passes the style through unchanged when no crop zoom is known', async () => {
    const { renderer, renderChunk } = createFakeRenderer()
    await runExport(baseOpts({ renderer, cropZoom: null }))

    const passedStyle = (renderChunk.mock.calls[0] as unknown[])[4] as {
      layers: Array<{ id: string; paint?: Record<string, unknown> }>
    }
    const road = passedStyle.layers.find((l) => l.id === 'road-highway')!
    expect(road.paint!['line-width']).toBe(2)
  })

  it('exportScaleFactor supports smaller outputs and treats missing zoom as 1', () => {
    expect(exportScaleFactor(14, 12)).toBe(4)
    expect(exportScaleFactor(12, 14)).toBe(0.25)
    expect(exportScaleFactor(14, null)).toBe(1)
    expect(exportScaleFactor(14, undefined)).toBe(1)
    expect(exportScaleFactor(14, NaN)).toBe(1)
  })
})
