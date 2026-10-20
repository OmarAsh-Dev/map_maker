import type { StyleSpecification } from 'maplibre-gl'
import { planChunks } from './chunkPlan'
import type { Chunk, ChunkPlan, CropBounds } from './chunkPlan'
import { exportGroups } from './maskPasses'
import type { PassKind } from './maskPasses'
import { scaleStyleForExport } from './scaleStyle'
import type { LayerMap } from './styleMap'

const FLAT_GROUP = 'Flat'

export const ATTRIBUTION_TEXT = '© OpenStreetMap contributors'

export interface ExportChunkImage {
  col: number
  row: number
  png: ArrayBuffer
}

export interface ExportRenderer {
  ensureStyle(style: StyleSpecification, signal?: AbortSignal): Promise<void>
  renderChunk(
    plan: ChunkPlan,
    chunk: Chunk,
    pass: PassKind,
    layerMap: LayerMap,
    style: StyleSpecification,
    signal?: AbortSignal
  ): Promise<ExportChunkImage>
  destroy(): void
}

export interface EnginePass {
  pass: PassKind
  groupLabel: string
}

export function computePasses(
  mode: 'flat' | 'layered',
  groups: { id: string; label: string }[]
): EnginePass[] {
  if (mode === 'flat') {
    return [{ pass: { type: 'flat' }, groupLabel: FLAT_GROUP }]
  }
  const passes: EnginePass[] = []
  for (const group of groups) {
    passes.push({ pass: { type: 'geometry', groupId: group.id }, groupLabel: group.label })
    passes.push({ pass: { type: 'labels', groupId: group.id }, groupLabel: `${group.label} labels` })
  }
  return passes
}

export function flattenGroupsForExport(
  groups: { id: string; label: string }[]
): { id: string; label: string }[] {
  const entries: { id: string; label: string }[] = []
  for (const group of groups) {
    entries.push({ id: group.id, label: group.label })
    entries.push({ id: group.id, label: `${group.label} labels` })
  }
  return entries
}

export interface RunExportOptions {
  bounds: CropBounds
  longEdgePx: number
  mode: 'flat' | 'layered'
  container: 'psd' | 'png-folder'
  style: StyleSpecification
  layerMap: LayerMap
  outPath: string
  attribution: boolean
  cropZoom?: number | null
  renderer?: ExportRenderer
  onProgress: (done: number, total: number) => void
  signal: AbortSignal
}

export function exportScaleFactor(planZoom: number, cropZoom: number | null | undefined): number {
  if (cropZoom == null || !Number.isFinite(cropZoom)) return 1
  return Math.max(1, Math.pow(2, planZoom - cropZoom))
}

export async function runExport(opts: RunExportOptions): Promise<void> {
  const plan = planChunks(opts.bounds, opts.longEdgePx)
  const factor = exportScaleFactor(plan.zoom, opts.cropZoom)
  const scaledStyle = scaleStyleForExport(opts.style, factor)
  const groups = opts.mode === 'flat' ? [] : exportGroups(opts.layerMap, scaledStyle)
  const passes = computePasses(opts.mode, groups)
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
    groups: flattenGroupsForExport(groups),
    outPath: opts.outPath,
    attribution: opts.attribution ? ATTRIBUTION_TEXT : null,
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
      await renderer.ensureStyle(scaledStyle, opts.signal)
    }
    for (const { pass, groupLabel } of passes) {
      for (const chunk of plan.chunks) {
        if (opts.signal.aborted) {
          throw new Error('Export cancelled')
        }
        const image = await renderer.renderChunk(
          plan,
          chunk,
          pass,
          opts.layerMap,
          scaledStyle,
          opts.signal
        )
        window.api.sendChunk(groupLabel, image.col, image.row, image.png)
        done += 1
        opts.onProgress(done, total)
      }
    }
    await window.api.finishExport()
  } catch (err) {
    if (!opts.signal.aborted) {
      window.api.cancelExport()
    }
    throw err
  } finally {
    if (renderer) {
      renderer.destroy()
    }
  }
}
