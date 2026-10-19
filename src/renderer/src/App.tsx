import { useCallback, useRef } from 'react'
import type { Map as MaplibreMap } from 'maplibre-gl'
import MapCanvas from './components/MapCanvas'

const OPENFREEMAP_LIBERTY = 'https://tiles.openfreemap.org/styles/liberty'

function App() {
  const mapRef = useRef<MaplibreMap | null>(null)

  const handleMapReady = useCallback((map: MaplibreMap) => {
    mapRef.current = map
  }, [])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <MapCanvas styleUrl={OPENFREEMAP_LIBERTY} onMapReady={handleMapReady} />
      <h1 className="pointer-events-none absolute left-4 top-4 z-10 text-4xl font-bold text-slate-50">
        map_maker
      </h1>
    </main>
  )
}

export default App
