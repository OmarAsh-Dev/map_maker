import type { StyleSpecification } from 'maplibre-gl'
import { planChunks } from './chunkPlan'
import type { Chunk, ChunkPlan, CropBounds } from './chunkPlan'
import { exportGroups } from './maskPasses'
import type { PassKind } from './maskPasses'
import type { LayerMap } from './styleMap'

const FLAT_GROUP = 'Flat'

export interface ExportChunkImage {
  col: number
  row: number
  png: ArrayBuffer
}

export interface ExportRenderer {
  ensureStyle(style: StyleSpecification): Promise<void>
  renderChunk(
    plan: ChunkPlan,
    chunk: Chunk,
    pass: PassKind,
    layerMap: LayerMap,
    style: StyleSpecification
  ): Promise<ExportChunkImage>
  destroy(): void
}

export interface EnginePass {
  pass: PassKind
  groupLabel: string
}

export function computePasses(
  mode: 'flat' | 'layered',
  layerMap: LayerMap,
  style: StyleSpecification
): EnginePass[] {
  if (mode === 'flat') {
    return [{ pass: { type: 'flat' }, groupLabel: FLAT_GROUP }]
  }
  const passes: EnginePass[] = []
  for (const group of exportGroups(layerMap, style)) {
    passes.push({ pass: { type: 'geometry', groupId: group.id }, groupLabel: group.label })
    passes.push({ pass: { type: 'labels', groupId: group.id }, groupLabel: group.label })
  }
  return passes
}

export interface RunExportOptions {
  bounds: CropBounds
  longEdgePx: number
  mode: 'flat' | 'layered'
  container: 'psd' | 'png-folder'
  style: StyleSpecification
  layerMap: LayerMap
  outPath: string
  renderer?: ExportRenderer
  onProgress: (done: number, total: number) => void
  signal: AbortSignal
}

export async function runExport(opts: RunExportOptions): Promise<void> {
  const plan = planChunks(opts.bounds, opts.longEdgePx)
  const passes = computePasses(opts.mode, opts.layerMap, opts.style)
  if (opts.signal.aborted) {
    throw new Error('Export cancelled')
  }

  window.api.beginExport({
    mode: opts.mode,
    container: opts.container,
    cols: plan.cols,
    rows: plan.rows,
    chunkPx: plan.chunkPx,
    actualWidth: plan.actualWidth,
    actualHeight: plan.actualHeight,
    outWidth: plan.actualWidth,
    outHeight: plan.actualHeight,
    groups: opts.mode === 'flat' ? [] : exportGroups(opts.layerMap, opts.style),
    outPath: opts.outPath,
  })

  let renderer = opts.renderer
  try {
    if (!renderer) {
      const { ChunkRenderer } = await import('./chunkRenderer')
      renderer = new ChunkRenderer({ chunkPx: plan.chunkPx })
    }
    const total = passes.length * plan.chunks.length
    let done = 0
    opts.onProgress(0, total)
    if (total > 0) {
      await renderer.ensureStyle(opts.style)
    }
    for (const { pass, groupLabel } of passes) {
      for (const chunk of plan.chunks) {
        if (opts.signal.aborted) {
          throw new Error('Export cancelled')
        }
        const image = await renderer.renderChunk(plan, chunk, pass, opts.layerMap, opts.style)
        window.api.sendChunk(groupLabel, image.col, image.row, image.png)
        done += 1
        opts.onProgress(done, total)
      }
    }
    await window.api.finishExport()
  } finally {
    if (renderer) {
      renderer.destroy()
    }
  }
}
