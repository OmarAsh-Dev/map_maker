import { useCallback, useRef } from 'react'
import type { Map as MaplibreMap } from 'maplibre-gl'
import MapCanvas from './components/MapCanvas'
import CategoryDetailPanel from './components/sidebar/CategoryDetailPanel'
import FeatureTree from './components/sidebar/FeatureTree'
import { buildLayerMapFromStyle } from './lib/layerMapBuilder'
import { useMapStore } from './stores/mapStore'

const OPENFREEMAP_LIBERTY = 'https://tiles.openfreemap.org/styles/liberty'

function App() {
  const mapRef = useRef<MaplibreMap | null>(null)
  const selectedCategoryId = useMapStore((state) => state.selectedCategoryId)

  const handleMapReady = useCallback((map: MaplibreMap) => {
    mapRef.current = map
    const style = map.getStyle()
    if (!style) return
    useMapStore.getState().styleLoaded(style, buildLayerMapFromStyle(style))
  }, [])

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-slate-950">
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white">
        <FeatureTree />
        {selectedCategoryId !== null && <CategoryDetailPanel />}
      </aside>
      <div className="relative min-w-0 flex-1">
        <MapCanvas styleUrl={OPENFREEMAP_LIBERTY} onMapReady={handleMapReady} />
        <h1 className="pointer-events-none absolute left-4 top-4 z-10 text-4xl font-bold text-slate-50">
          map_maker
        </h1>
      </div>
    </main>
  )
}

export default App
