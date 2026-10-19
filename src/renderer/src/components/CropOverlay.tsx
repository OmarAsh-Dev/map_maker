import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useExportStore } from '../stores/exportStore'

interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

export default function CropOverlay() {
  const cropMode = useExportStore((state) => state.cropMode)
  const bounds = useExportStore((state) => state.cropBounds)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const [dragRect, setDragRect] = useState<ScreenRect | null>(null)
  const [savedRect, setSavedRect] = useState<ScreenRect | null>(null)

  useEffect(() => {
    const map = useExportStore.getState().mapInstance
    if (!map || !bounds) {
      setSavedRect(null)
      return
    }
    const recompute = () => {
      const northwest = map.project([bounds.west, bounds.north])
      const southeast = map.project([bounds.east, bounds.south])
      setSavedRect({
        x: Math.min(northwest.x, southeast.x),
        y: Math.min(northwest.y, southeast.y),
        width: Math.abs(southeast.x - northwest.x),
        height: Math.abs(southeast.y - northwest.y),
      })
    }
    recompute()
    map.on('move', recompute)
    map.on('resize', recompute)
    return () => {
      map.off('move', recompute)
      map.off('resize', recompute)
    }
  }, [bounds])

  if (!cropMode && !savedRect) return null

  const localPoint = (event: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect()
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropMode || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = localPoint(event)
    dragStartRef.current = point
    setDragRect({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    if (!cropMode || !start) return
    const point = localPoint(event)
    setDragRect({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    })
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    dragStartRef.current = null
    setDragRect(null)
    if (!cropMode || !start) return
    const point = localPoint(event)
    const left = Math.min(start.x, point.x)
    const right = Math.max(start.x, point.x)
    const top = Math.min(start.y, point.y)
    const bottom = Math.max(start.y, point.y)
    if (right - left < 2 || bottom - top < 2) return
    const map = useExportStore.getState().mapInstance
    if (!map) return
    const northwest = map.unproject([left, top])
    const southeast = map.unproject([right, bottom])
    useExportStore.getState().setCropBounds({
      west: northwest.lng,
      north: northwest.lat,
      east: southeast.lng,
      south: southeast.lat,
    })
  }

  const rect = dragRect ?? savedRect

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-20 overflow-hidden ${
        cropMode ? 'cursor-crosshair' : 'pointer-events-none'
      }`}
      onPointerDown={cropMode ? handlePointerDown : undefined}
      onPointerMove={cropMode ? handlePointerMove : undefined}
      onPointerUp={cropMode ? handlePointerUp : undefined}
    >
      {rect && (
        <div
          data-testid="crop-rect"
          className="absolute border-2 border-sky-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        />
      )}
      {cropMode && !dragRect && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
          <span className="rounded bg-slate-900/80 px-3 py-1.5 text-sm text-white">
            Drag on the map to select the export area
          </span>
        </div>
      )}
    </div>
  )
}
