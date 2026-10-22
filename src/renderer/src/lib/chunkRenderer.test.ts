// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { ChunkRenderer } from './chunkRenderer'
import { lngLatToWorldPx, planChunks } from './chunkPlan'

const { maps } = vi.hoisted(() => ({ maps: [] as Array<{
  options: Record<string, unknown>
  jumpTo: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}> }))

vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  setMaxParallelImageRequests: vi.fn(),
  Map: class {
    jumpTo = vi.fn()
    remove = vi.fn()
    setStyle = vi.fn()
    off = vi.fn()
    constructor(public options: Record<string, unknown>) { maps.push(this) }
    once(_event: string, cb: () => void) { queueMicrotask(cb) }
    getCanvas() {
      const size = Math.round(Number(this.options.pixelRatio) *
        parseFloat((this.options.container as HTMLElement).style.width))
      return { width: size, height: size, toDataURL: () => 'data:image/png;base64,AQ==' }
    }
  },
}))

const style: StyleSpecification = {
  version: 8, sources: {}, layers: [{ id: 'bg', type: 'background' }],
}

afterEach(() => { maps.length = 0; vi.restoreAllMocks(); document.body.innerHTML = '' })

describe('preview zoom export rendering', () => {
  it.each([0.5, 2, 3.7])('renders at preview zoom with pixel ratio %s and aligned chunks', async (factor) => {
    const plan = planChunks({ west: 0, east: 1, south: 0, north: 1 }, 4096)
    const cropZoom = plan.zoom - Math.log2(factor)
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AQ==')
    const renderer = new ChunkRenderer({ chunkPx: plan.chunkPx, pixelRatio: factor })
    try {
      for (const chunk of [plan.chunks[0], plan.chunks.at(-1)!]) {
        await renderer.renderChunk(plan, chunk, { type: 'flat' }, {}, style)
        const map = maps[0]
        expect(map.options.pixelRatio).toBeCloseTo(factor)
        const camera = map.jumpTo.mock.lastCall![0]
        expect(camera.zoom).toBeCloseTo(cropZoom, 12)
        const size = parseFloat((map.options.container as HTMLElement).style.width)
        const center = lngLatToWorldPx(camera.center[0], camera.center[1], plan.zoom)
        const wanted = lngLatToWorldPx(chunk.lng, chunk.lat, plan.zoom)
        // Cropping the top-left output square must keep the chunk's exact world bounds,
        // even when CSS dimensions must be rounded to whole pixels.
        expect(center.x - size * factor / 2).toBeCloseTo(wanted.x - plan.chunkPx / 2, 6)
        expect(center.y - size * factor / 2).toBeCloseTo(wanted.y - plan.chunkPx / 2, 6)
      }
      expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2048, 2048, 0, 0, 2048, 2048)
    } finally { renderer.destroy() }
    expect(maps[0].remove).toHaveBeenCalledOnce()
  })
})
