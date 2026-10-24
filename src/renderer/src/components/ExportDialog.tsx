import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import AppLogo from './AppLogo'
import { MAX_EXPORT_PX, planChunks } from '../lib/chunkPlan'
import { runExport } from '../lib/exportEngine'
import {
  ASPECT_RATIO_PRESETS,
  effectiveLongEdge,
  SIZE_PRESETS,
  useExportStore,
} from '../stores/exportStore'
import { useMapStore } from '../stores/mapStore'

function progressPercent(
  status: string,
  renderDone: number,
  renderTotal: number,
  compositeDone: number,
  compositeTotal: number
): number | null {
  if (status === 'done') return 100
  if (status === 'rendering' && renderTotal > 0) {
    return Math.round((renderDone / renderTotal) * 100)
  }
  if (status === 'compositing' && compositeTotal > 0) {
    return Math.round((compositeDone / compositeTotal) * 100)
  }
  return null
}

function statusText(
  status: string,
  renderDone: number,
  renderTotal: number,
  compositeDone: number,
  compositeTotal: number,
  outputPath: string | null,
  message: string | null
): string | null {
  switch (status) {
    case 'rendering':
      return `Rendering chunks ${renderDone}/${renderTotal}`
    case 'compositing':
      return `Compositing layers ${compositeDone}/${compositeTotal}`
    case 'assembling':
      return 'Assembling output…'
    case 'done':
      return `Saved to ${outputPath ?? 'file'}`
    case 'cancelled':
      return 'Export cancelled'
    case 'error':
      return `Export failed: ${message ?? 'unknown error'}`
    default:
      return null
  }
}

export default function ExportDialog() {
  const dialogOpen = useExportStore((state) => state.dialogOpen)
  const mode = useExportStore((state) => state.mode)
  const container = useExportStore((state) => state.container)
  const sizePreset = useExportStore((state) => state.sizePreset)
  const customLongEdge = useExportStore((state) => state.customLongEdge)
  const aspectRatio = useExportStore((state) => state.aspectRatio)
  const attribution = useExportStore((state) => state.attribution)
  const cropBounds = useExportStore((state) => state.cropBounds)
  const exporting = useExportStore((state) => state.exporting)
  const status = useExportStore((state) => state.status)
  const renderDone = useExportStore((state) => state.renderDone)
  const renderTotal = useExportStore((state) => state.renderTotal)
  const compositeDone = useExportStore((state) => state.compositeDone)
  const compositeTotal = useExportStore((state) => state.compositeTotal)
  const outputPath = useExportStore((state) => state.outputPath)
  const message = useExportStore((state) => state.message)
  const style = useMapStore((state) => state.style)
  const layerMap = useMapStore((state) => state.layerMap)
  const [warnAttribution, setWarnAttribution] = useState(false)

  useEffect(() => {
    if (typeof window.api === 'undefined') return
    return window.api.onExportProgress((progress) => {
      useExportStore.getState().handleMainProgress(progress)
    })
  }, [])

  if (!dialogOpen) return null

  const longEdge = effectiveLongEdge({ sizePreset, customLongEdge })
  const dims = cropBounds ? planChunks(cropBounds, longEdge) : null
  const percent = progressPercent(status, renderDone, renderTotal, compositeDone, compositeTotal)
  const line = statusText(status, renderDone, renderTotal, compositeDone, compositeTotal, outputPath, message)
  const indeterminate = status === 'assembling'

  const handleCustomChange = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseInt(event.target.value, 10)
    if (Number.isNaN(parsed)) return
    useExportStore.getState().setCustomLongEdge(parsed)
  }

  const handleAttributionChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      useExportStore.getState().setAttribution(true)
      return
    }
    setWarnAttribution(true)
  }

  const handleCancel = () => {
    const state = useExportStore.getState()
    state.abortController?.abort()
    if (typeof window.api !== 'undefined') {
      window.api.cancelExport()
    }
  }

  const handleExport = async () => {
    const state = useExportStore.getState()
    if (!state.cropBounds || !style || state.exporting || typeof window.api === 'undefined') {
      return
    }
    const kind = state.mode === 'flat' ? 'png' : state.container
    const isLargePsb = Boolean(dims && (dims.actualWidth > 30000 || dims.actualHeight > 30000))
    const defaultName =
      state.mode === 'flat'
        ? 'map.png'
        : state.container === 'psd'
          ? isLargePsb
            ? 'map.psb'
            : 'map.psd'
          : 'map-layers'
    const outPath = await window.api.selectExportPath(defaultName, kind)
    if (!outPath) return
    const controller = state.beginExportState()
    try {
      await runExport({
        bounds: state.cropBounds,
        longEdgePx: longEdge,
        mode: state.mode,
        container: state.container,
        style,
        layerMap,
        outPath,
        attribution: state.attribution,
        cropZoom: state.mapInstance?.getZoom() ?? state.cropZoom,
        onProgress: (done, total) => useExportStore.getState().setRenderProgress(done, total),
        signal: controller.signal,
      })
      const after = useExportStore.getState()
      after.endExport('done')
    } catch (err) {
      const after = useExportStore.getState()
      if (controller.signal.aborted) {
        after.endExport('cancelled', 'Export cancelled')
      } else if (after.status !== 'error') {
        after.endExport('error', err instanceof Error ? err.message : String(err))
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Export map"
      className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/50"
    >
      <div className="relative w-[26rem] max-w-full rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center gap-2.5">
          <AppLogo className="h-6 w-6 shrink-0" />
          <h2 className="text-base font-semibold text-slate-900">Export map</h2>
        </div>

        <fieldset className="mt-4" aria-label="Export mode">
          <legend className="text-xs font-medium uppercase tracking-wide text-gray-500">Mode</legend>
          <div className="mt-1 flex gap-4">
            <label className="flex items-center gap-1.5 text-sm text-gray-800">
              <input
                type="radio"
                name="export-mode"
                checked={mode === 'flat'}
                onChange={() => useExportStore.getState().setMode('flat')}
              />
              Flat
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-800">
              <input
                type="radio"
                name="export-mode"
                checked={mode === 'layered'}
                onChange={() => useExportStore.getState().setMode('layered')}
              />
              Layered
            </label>
          </div>
        </fieldset>

        {mode === 'layered' && (
          <fieldset className="mt-3" aria-label="Layered container">
            <legend className="text-xs font-medium uppercase tracking-wide text-gray-500">Container</legend>
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-gray-800">
                <input
                  type="radio"
                  name="export-container"
                  checked={container === 'psd'}
                  onChange={() => useExportStore.getState().setContainer('psd')}
                />
                PSD
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-800">
                <input
                  type="radio"
                  name="export-container"
                  checked={container === 'png-folder'}
                  onChange={() => useExportStore.getState().setContainer('png-folder')}
                />
                PNG folder
              </label>
            </div>
          </fieldset>
        )}

        <fieldset className="mt-3" aria-label="Output size">
          <legend className="text-xs font-medium uppercase tracking-wide text-gray-500">Size (long edge)</legend>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
            {SIZE_PRESETS.map((preset) => (
              <label key={preset.id} className="flex items-center gap-1.5 text-sm text-gray-800">
                <input
                  type="radio"
                  name="export-size"
                  checked={sizePreset === preset.id}
                  onChange={() => useExportStore.getState().setSizePreset(preset.id)}
                />
                {preset.label}
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-sm text-gray-800">
              <input
                type="radio"
                name="export-size"
                checked={sizePreset === 'custom'}
                onChange={() => useExportStore.getState().setSizePreset('custom')}
              />
              Custom
            </label>
            <input
              type="number"
              aria-label="Custom long edge"
              min={1}
              max={MAX_EXPORT_PX}
              value={customLongEdge}
              onChange={handleCustomChange}
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-xs text-gray-500">px, max {MAX_EXPORT_PX}</span>
          </div>
        </fieldset>

        <fieldset className="mt-3" aria-label="Aspect ratio">
          <legend className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Aspect ratio
          </legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            {ASPECT_RATIO_PRESETS.map((preset) => (
              <label key={preset.id} className="flex items-center gap-1.5 text-sm text-gray-800">
                <input
                  type="radio"
                  name="export-ratio"
                  checked={aspectRatio === preset.id}
                  onChange={() => useExportStore.getState().setAspectRatio(preset.id)}
                />
                {preset.label}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="mt-3 text-xs text-gray-500">
          {cropBounds && dims
            ? `Output ${dims.actualWidth} × ${dims.actualHeight} px. Preserves map styling and detail from the app preview.`
            : 'Select an export area on the map first. The output size derives from the crop aspect ratio.'}
        </p>

        {cropBounds && dims && dims.zoom > 14 && (
          <p
            data-testid="overzoom-warning"
            className="mt-2 rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800"
          >
            Note: Derived zoom ({dims.zoom.toFixed(1)}) exceeds OpenFreeMap&apos;s max tile zoom
            (14); vector features are upscaled without extra detail beyond zoom 14.
          </p>
        )}

        <label className="mt-3 flex items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={attribution} onChange={handleAttributionChange} />
          Include attribution
        </label>

        {(exporting || line) && (
          <div className="mt-4">
            <div
              className={`h-2 w-full overflow-hidden rounded bg-gray-200 ${
                indeterminate ? 'animate-pulse' : ''
              }`}
            >
              <div
                className="h-full bg-sky-500 transition-[width]"
                style={{ width: `${percent ?? 100}%` }}
              />
            </div>
            {line && <p className="mt-1 text-xs text-gray-600">{line}</p>}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => useExportStore.getState().setDialogOpen(false)}
            disabled={exporting}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Close
          </button>
          {exporting ? (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={!cropBounds || !style}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export
            </button>
          )}
        </div>

        {warnAttribution && (
          <div
            role="alertdialog"
            aria-label="Attribution notice"
            className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-slate-950/60 p-4"
          >
            <div className="rounded-lg bg-white p-4 shadow-xl">
              <h3 className="text-sm font-semibold text-slate-900">Remove attribution?</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                OpenStreetMap data is licensed under the Open Database License (ODbL), and
                OpenFreeMap&apos;s terms likewise require visible attribution. Both require
                attribution in published media, including still images and video. Removing it may
                violate these licenses; if you proceed, compliance is your responsibility.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setWarnAttribution(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Keep attribution
                </button>
                <button
                  type="button"
                  onClick={() => {
                    useExportStore.getState().setAttribution(false)
                    setWarnAttribution(false)
                  }}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
                >
                  Remove attribution
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
