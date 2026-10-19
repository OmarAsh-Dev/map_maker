import { useEffect, useRef } from 'react'
import { Map as MaplibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { createMapOptions } from '../lib/mapOptions'

setWorkerUrl(maplibreWorkerUrl)

interface MapCanvasProps {
  styleUrl: string
  onMapReady: (map: MaplibreMap) => void
}

export default function MapCanvas({ styleUrl, onMapReady }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onMapReadyRef = useRef(onMapReady)
  onMapReadyRef.current = onMapReady

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const map = new MaplibreMap(createMapOptions(container, styleUrl))
    map.on('load', () => {
      onMapReadyRef.current(map)
    })
    return () => {
      map.remove()
    }
  }, [styleUrl])

  return <div ref={containerRef} className="h-full w-full" />
}
