import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { planChunks } from '../lib/chunkPlan'
import type { CropBounds } from '../lib/chunkPlan'
import { effectiveLongEdge, useExportStore } from '../stores/exportStore'

interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

type DragState =
  | { mode: 'draw'; start: { x: number; y: number } }
  | { mode: 'move'; start: { x: number; y: number }; initialRect: ScreenRect }
  | { mode: 'resize'; dir: HandleDir; initialRect: ScreenRect }

const HANDLE_SPECS: { dir: HandleDir; cursor: string; style: CSSProperties }[] = [
  { dir: 'nw', cursor: 'cursor-nwse-resize', style: { top: -5, left: -5 } },
  { dir: 'n', cursor: 'cursor-ns-resize', style: { top: -5, left: '50%', transform: 'translateX(-50%)' } },
  { dir: 'ne', cursor: 'cursor-nesw-resize', style: { top: -5, right: -5 } },
  { dir: 'e', cursor: 'cursor-ew-resize', style: { top: '50%', right: -5, transform: 'translateY(-50%)' } },
  { dir: 'se', cursor: 'cursor-nwse-resize', style: { bottom: -5, right: -5 } },
  { dir: 's', cursor: 'cursor-ns-resize', style: { bottom: -5, left: '50%', transform: 'translateX(-50%)' } },
  { dir: 'sw', cursor: 'cursor-nesw-resize', style: { bottom: -5, left: -5 } },
  { dir: 'w', cursor: 'cursor-ew-resize', style: { top: '50%', left: -5, transform: 'translateY(-50%)' } },
]

function computeDragRect(state: DragState, point: { x: number; y: number }): ScreenRect {
  if (state.mode === 'draw') {
    return {
      x: Math.min(state.start.x, point.x),
      y: Math.min(state.start.y, point.y),
      width: Math.abs(point.x - state.start.x),
      height: Math.abs(point.y - state.start.y),
    }
  }
  if (state.mode === 'move') {
    const dx = point.x - state.start.x
    const dy = point.y - state.start.y
    return {
      x: state.initialRect.x + dx,
      y: state.initialRect.y + dy,
      width: state.initialRect.width,
      height: state.initialRect.height,
    }
  }
  let left = state.initialRect.x
  let top = state.initialRect.y
  let right = state.initialRect.x + state.initialRect.width
  let bottom = state.initialRect.y + state.initialRect.height
  if (state.dir.includes('w')) left = point.x
  if (state.dir.includes('e')) right = point.x
  if (state.dir.includes('n')) top = point.y
  if (state.dir.includes('s')) bottom = point.y
  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top),
  }
}

export default function CropOverlay() {
  const cropMode = useExportStore((state) => state.cropMode)
  const bounds = useExportStore((state) => state.cropBounds)
  const sizePreset = useExportStore((state) => state.sizePreset)
  const customLongEdge = useExportStore((state) => state.customLongEdge)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
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
    containerRef.current?.setPointerCapture?.(event.pointerId)
    const point = localPoint(event)
    dragStateRef.current = { mode: 'draw', start: point }
    setDragRect({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const startMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropMode || event.button !== 0 || !savedRect) return
    event.preventDefault()
    event.stopPropagation()
    containerRef.current?.setPointerCapture?.(event.pointerId)
    const point = localPoint(event)
    dragStateRef.current = { mode: 'move', start: point, initialRect: savedRect }
    setDragRect(savedRect)
  }

  const startResize = (dir: HandleDir) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropMode || event.button !== 0 || !savedRect) return
    event.preventDefault()
    event.stopPropagation()
    containerRef.current?.setPointerCapture?.(event.pointerId)
    dragStateRef.current = { mode: 'resize', dir, initialRect: savedRect }
    setDragRect(savedRect)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current
    if (!cropMode || !state) return
    const point = localPoint(event)
    setDragRect(computeDragRect(state, point))
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current
    dragStateRef.current = null
    setDragRect(null)
    if (!cropMode || !state) return
    const point = localPoint(event)
    const nextRect = computeDragRect(state, point)
    if (nextRect.width < 2 || nextRect.height < 2) return
    const map = useExportStore.getState().mapInstance
    if (!map) return
    const northwest = map.unproject([nextRect.x, nextRect.y])
    const southeast = map.unproject([nextRect.x + nextRect.width, nextRect.y + nextRect.height])
    useExportStore.getState().setCropBounds(
      {
        west: northwest.lng,
        north: northwest.lat,
        east: southeast.lng,
        south: southeast.lat,
      },
      map.getZoom()
    )
  }

  const rect = dragRect ?? savedRect
  const map = useExportStore.getState().mapInstance

  let activeBounds: CropBounds | null = bounds
  if (dragRect && dragRect.width >= 2 && dragRect.height >= 2 && map) {
    const nw = map.unproject([dragRect.x, dragRect.y])
    const se = map.unproject([dragRect.x + dragRect.width, dragRect.y + dragRect.height])
    activeBounds = { west: nw.lng, north: nw.lat, east: se.lng, south: se.lat }
  }

  const dims =
    activeBounds &&
    activeBounds.east > activeBounds.west &&
    activeBounds.north > activeBounds.south
      ? planChunks(activeBounds, effectiveLongEdge({ sizePreset, customLongEdge }))
      : null

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
          className={`absolute border-2 border-sky-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)] ${
            cropMode ? 'cursor-move' : ''
          }`}
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          onPointerDown={cropMode ? startMove : undefined}
        >
          {cropMode &&
            HANDLE_SPECS.map((handle) => (
              <div
                key={handle.dir}
                data-testid={`crop-handle-${handle.dir}`}
                className={`absolute h-2.5 w-2.5 rounded-sm border border-slate-900 bg-sky-400 ${handle.cursor}`}
                style={handle.style}
                onPointerDown={startResize(handle.dir)}
              />
            ))}
          {dims && (
            <div
              data-testid="crop-dimensions"
              className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900/90 px-2 py-0.5 font-mono text-xs text-sky-200 shadow"
            >
              {dims.actualWidth.toLocaleString()} × {dims.actualHeight.toLocaleString()} px
            </div>
          )}
        </div>
      )}
      {cropMode && !dragRect && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
          <span className="rounded bg-slate-900/80 px-3 py-1.5 text-sm text-white">
            {savedRect
              ? 'Drag handles to resize, drag inside to move, or drag outside to redraw'
              : 'Drag on the map to select the export area'}
          </span>
        </div>
      )}
    </div>
  )
}
