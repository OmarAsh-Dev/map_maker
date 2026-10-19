import { useEffect, useRef } from 'react'
import { Map as MaplibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { createMapOptions } from '../lib/mapOptions'
import { useMapStore } from '../stores/mapStore'

setWorkerUrl(maplibreWorkerUrl)

interface MapCanvasProps {
  styleUrl: string
  onMapReady: (map: MaplibreMap) => void
}

export default function MapCanvas({ styleUrl, onMapReady }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const onMapReadyRef = useRef(onMapReady)
  onMapReadyRef.current = onMapReady
  const style = useMapStore((state) => state.style)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const map = new MaplibreMap(createMapOptions(container, styleUrl))
    mapRef.current = map
    map.on('load', () => {
      onMapReadyRef.current(map)
    })
    return () => {
      mapRef.current = null
      map.remove()
    }
  }, [styleUrl])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !style) {
      return
    }
    map.setStyle(style)
  }, [style])

  return <div ref={containerRef} className="h-full w-full" />
}
