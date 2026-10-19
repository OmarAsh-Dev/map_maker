import { useCallback, useRef } from 'react'
import type { Map as MaplibreMap } from 'maplibre-gl'
import MapCanvas from './components/MapCanvas'
import CropOverlay from './components/CropOverlay'
import ExportDialog from './components/ExportDialog'
import PresetsBar from './components/PresetsBar'
import CategoryDetailPanel from './components/sidebar/CategoryDetailPanel'
import FeatureTree from './components/sidebar/FeatureTree'
import { buildLayerMapFromStyle } from './lib/layerMapBuilder'
import type { LayerMap } from './lib/styleMap'
import { useExportStore } from './stores/exportStore'
import { useMapStore } from './stores/mapStore'

const EMPTY_LAYER_MAP: LayerMap = {}

export const BASEMAP_STYLES: { label: string; url: string }[] = [
  { label: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
  { label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' },
  { label: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark' },
  { label: 'Fiord', url: 'https://tiles.openfreemap.org/styles/fiord' },
]

function App() {
  const mapRef = useRef<MaplibreMap | null>(null)
  const selectedCategoryId = useMapStore((state) => state.selectedCategoryId)
  const basemapUrl = useMapStore((state) => state.basemapUrl)
  const cropMode = useExportStore((state) => state.cropMode)

  const handleMapReady = useCallback((map: MaplibreMap) => {
    mapRef.current = map
    useExportStore.getState().setMapInstance(map)
    const style = map.getStyle()
    if (!style) return
    useMapStore.getState().styleLoaded(style, buildLayerMapFromStyle(style))
  }, [])

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-slate-950">
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-3">
          <label
            htmlFor="basemap-select"
            className="block text-xs font-medium uppercase tracking-wide text-gray-500"
          >
            Basemap
          </label>
          <select
            id="basemap-select"
            aria-label="Basemap style"
            value={basemapUrl}
            onChange={(event) =>
              useMapStore.getState().setBasemap(event.target.value, EMPTY_LAYER_MAP)
            }
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {BASEMAP_STYLES.map((style) => (
              <option key={style.url} value={style.url}>
                {style.label}
              </option>
            ))}
          </select>
        </div>
        <PresetsBar />
        <FeatureTree />
        {selectedCategoryId !== null && <CategoryDetailPanel />}
      </aside>
      <div className="relative min-w-0 flex-1">
        <MapCanvas key={basemapUrl} styleUrl={basemapUrl} onMapReady={handleMapReady} />
        <h1 className="pointer-events-none absolute left-4 top-4 z-10 text-4xl font-bold text-slate-50">
          map_maker
        </h1>
        <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const state = useExportStore.getState()
              state.setCropMode(!state.cropMode)
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium shadow ${
              cropMode
                ? 'bg-sky-600 text-white hover:bg-sky-500'
                : 'bg-white/90 text-slate-800 hover:bg-white'
            }`}
          >
            {cropMode ? 'Done selecting' : 'Select area'}
          </button>
          <button
            type="button"
            onClick={() => useExportStore.getState().setDialogOpen(true)}
            className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-800 shadow hover:bg-white"
          >
            Export
          </button>
        </div>
        <CropOverlay />
        <ExportDialog />
      </div>
    </main>
  )
}

export default App
