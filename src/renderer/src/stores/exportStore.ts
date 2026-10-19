import type { Map as MaplibreMap } from 'maplibre-gl'
import { create } from 'zustand'
import { MAX_EXPORT_PX, adjustBoundsToRatio } from '../lib/chunkPlan'
import type { CropBounds } from '../lib/chunkPlan'

export type ExportMode = 'flat' | 'layered'
export type ExportContainer = 'psd' | 'png-folder'
export type SizePresetId = '1080p' | '4K' | '8K' | '16K' | 'custom'
export type AspectRatioId = 'free' | '16:9' | '9:16' | '1:1'

export const ASPECT_RATIO_PRESETS: {
  id: AspectRatioId
  label: string
  ratio: number | null
}[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '1:1', label: '1:1', ratio: 1 },
]

export const SIZE_PRESETS: { id: Exclude<SizePresetId, 'custom'>; label: string; longEdge: number }[] = [
  { id: '1080p', label: '1080p', longEdge: 1920 },
  { id: '4K', label: '4K', longEdge: 3840 },
  { id: '8K', label: '8K', longEdge: 8192 },
  { id: '16K', label: '16K', longEdge: 16384 },
]

export function clampLongEdge(px: number): number {
  if (!Number.isFinite(px)) return 1
  return Math.min(Math.max(Math.round(px), 1), MAX_EXPORT_PX)
}

export function effectiveLongEdge(
  state: Pick<ExportState, 'sizePreset' | 'customLongEdge'>
): number {
  if (state.sizePreset === 'custom') return clampLongEdge(state.customLongEdge)
  return SIZE_PRESETS.find((preset) => preset.id === state.sizePreset)?.longEdge ?? 1920
}

export type ExportStatus =
  | 'idle'
  | 'rendering'
  | 'compositing'
  | 'assembling'
  | 'done'
  | 'cancelled'
  | 'error'

export type ExportMainProgress =
  | { stage: 'compositing'; group: string; done: number; total: number }
  | { stage: 'assembling' }
  | { stage: 'done'; path: string }
  | { stage: 'error'; message: string }

export interface ExportState {
  mapInstance: MaplibreMap | null
  cropMode: boolean
  cropBounds: CropBounds | null
  dialogOpen: boolean
  mode: ExportMode
  container: ExportContainer
  sizePreset: SizePresetId
  customLongEdge: number
  aspectRatio: AspectRatioId
  attribution: boolean
  exporting: boolean
  status: ExportStatus
  renderDone: number
  renderTotal: number
  compositeDone: number
  compositeTotal: number
  outputPath: string | null
  message: string | null
  abortController: AbortController | null
  setMapInstance(map: MaplibreMap | null): void
  setCropMode(active: boolean): void
  setCropBounds(bounds: CropBounds | null): void
  setDialogOpen(open: boolean): void
  setMode(mode: ExportMode): void
  setContainer(container: ExportContainer): void
  setSizePreset(preset: SizePresetId): void
  setCustomLongEdge(px: number): void
  setAspectRatio(ratio: AspectRatioId): void
  setAttribution(value: boolean): void
  beginExportState(): AbortController
  setRenderProgress(done: number, total: number): void
  handleMainProgress(progress: ExportMainProgress): void
  endExport(status: ExportStatus, message?: string | null): void
}

export const useExportStore = create<ExportState>()((set, get) => ({
  mapInstance: null,
  cropMode: false,
  cropBounds: null,
  dialogOpen: false,
  mode: 'flat',
  container: 'psd',
  sizePreset: '4K',
  customLongEdge: 3840,
  aspectRatio: 'free',
  attribution: true,
  exporting: false,
  status: 'idle',
  renderDone: 0,
  renderTotal: 0,
  compositeDone: 0,
  compositeTotal: 0,
  outputPath: null,
  message: null,
  abortController: null,
  setMapInstance: (map) => set({ mapInstance: map }),
  setCropMode: (active) => set({ cropMode: active }),
  setCropBounds: (bounds) => set({ cropBounds: bounds }),
  setDialogOpen: (open) => set({ dialogOpen: open }),
  setMode: (mode) => set({ mode }),
  setContainer: (container) => set({ container }),
  setSizePreset: (preset) => set({ sizePreset: preset }),
  setCustomLongEdge: (px) => set({ customLongEdge: clampLongEdge(px), sizePreset: 'custom' }),
  setAspectRatio: (ratio) => {
    const preset = ASPECT_RATIO_PRESETS.find((entry) => entry.id === ratio)
    const state = get()
    if (!preset || preset.ratio === null || !state.cropBounds) {
      set({ aspectRatio: ratio })
      return
    }
    set({
      aspectRatio: ratio,
      cropBounds: adjustBoundsToRatio(state.cropBounds, preset.ratio),
    })
  },
  setAttribution: (value) => set({ attribution: value }),
  beginExportState: () => {
    const controller = new AbortController()
    set({
      abortController: controller,
      exporting: true,
      status: 'rendering',
      renderDone: 0,
      renderTotal: 0,
      compositeDone: 0,
      compositeTotal: 0,
      outputPath: null,
      message: null,
    })
    return controller
  },
  setRenderProgress: (done, total) => set({ renderDone: done, renderTotal: total }),
  handleMainProgress: (progress) => {
    if (progress.stage === 'compositing') {
      set({ status: 'compositing', compositeDone: progress.done, compositeTotal: progress.total })
      return
    }
    if (progress.stage === 'assembling') {
      set({ status: 'assembling' })
      return
    }
    if (progress.stage === 'done') {
      set({ status: 'done', outputPath: progress.path, exporting: false })
      return
    }
    set({ status: 'error', message: progress.message })
  },
  endExport: (status, message = null) => set({ exporting: false, status, message }),
}))
