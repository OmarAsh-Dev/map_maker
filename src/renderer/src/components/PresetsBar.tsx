import { useCallback, useEffect, useState } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import { buildLayerMapFromStyle } from '../lib/layerMapBuilder'
import { useMapStore } from '../stores/mapStore'

interface PresetMeta {
  name: string
  mtime: number
}

function hasApi(): boolean {
  return typeof window !== 'undefined' && typeof window.api !== 'undefined'
}

export default function PresetsBar() {
  const [name, setName] = useState('')
  const [presets, setPresets] = useState<PresetMeta[]>([])
  const [busy, setBusy] = useState(false)
  const hasStyle = useMapStore((state) => state.style !== null)

  const refresh = useCallback(async () => {
    if (!hasApi()) return
    setPresets(await window.api.listPresets())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSave = async () => {
    const style = useMapStore.getState().style
    const trimmed = name.trim()
    if (!hasApi() || !style || trimmed.length === 0 || busy) return
    setBusy(true)
    try {
      await window.api.savePreset(trimmed, JSON.stringify(style))
      setName('')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleLoad = async (presetName: string) => {
    if (!hasApi() || busy) return
    const raw = await window.api.loadPreset(presetName)
    if (!raw) return
    const parsed = JSON.parse(raw) as StyleSpecification
    useMapStore.getState().styleLoaded(parsed, buildLayerMapFromStyle(parsed))
  }

  const handleDelete = async (presetName: string) => {
    if (!hasApi() || busy) return
    setBusy(true)
    try {
      await window.api.deletePreset(presetName)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Style presets" className="border-b border-gray-200 px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          aria-label="Preset name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Preset name"
          className="h-7 min-w-0 flex-1 rounded border border-gray-300 px-2 text-sm text-gray-900"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!hasStyle || name.trim().length === 0 || busy}
          className="h-7 shrink-0 rounded bg-slate-800 px-2.5 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save preset
        </button>
      </div>
      {presets.length > 0 && (
        <ul className="mt-2 space-y-1">
          {presets.map((preset) => (
            <li key={preset.name} className="flex items-center gap-2 text-sm text-gray-800">
              <span className="min-w-0 flex-1 truncate">{preset.name}</span>
              <button
                type="button"
                aria-label={`Load preset ${preset.name}`}
                onClick={() => void handleLoad(preset.name)}
                className="h-6 shrink-0 rounded border border-gray-300 px-2 text-xs text-gray-700 hover:bg-gray-100"
              >
                Load
              </button>
              <button
                type="button"
                aria-label={`Delete preset ${preset.name}`}
                onClick={() => void handleDelete(preset.name)}
                className="h-6 shrink-0 rounded border border-gray-300 px-2 text-xs text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
