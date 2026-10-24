// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { Map as MaplibreMap } from 'maplibre-gl'
import CropOverlay from './CropOverlay'
import { useExportStore } from '../stores/exportStore'

function createFakeMap() {
  // Simple linear projection: 1 deg lng = 100 px from x=500, 1 deg lat = -100 px from y=500
  return {
    project: vi.fn(([lng, lat]: [number, number]) => ({
      x: 500 + lng * 100,
      y: 500 - lat * 100,
    })),
    unproject: vi.fn(([x, y]: [number, number]) => ({
      lng: (x - 500) / 100,
      lat: (500 - y) / 100,
    })),
    getZoom: vi.fn(() => 10),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as MaplibreMap
}

beforeEach(() => {
  const map = createFakeMap()
  useExportStore.setState({
    mapInstance: map,
    cropMode: true,
    cropBounds: null,
    cropZoom: null,
    sizePreset: '4K',
    customLongEdge: 3840,
    aspectRatio: 'free',
  })
})

afterEach(() => {
  cleanup()
  useExportStore.setState({
    mapInstance: null,
    cropMode: false,
    cropBounds: null,
    cropZoom: null,
  })
})

describe('CropOverlay', () => {
  it('renders 8 resize handles and live pixel dimensions when cropBounds is set in cropMode', () => {
    act(() => {
      useExportStore.getState().setCropBounds(
        { west: -1, north: 1, east: 1, south: -1 },
        10
      )
    })

    render(<CropOverlay />)

    expect(screen.getByTestId('crop-rect')).toBeInTheDocument()
    for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      expect(screen.getByTestId(`crop-handle-${dir}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('crop-dimensions')).toHaveTextContent(/3,840\s*×\s*3,840\s*px/)
  })

  it('resizes the crop bounds when dragging the southeast handle', () => {
    // Initial rect: west=-1 (x=400), north=1 (y=400), east=1 (x=600), south=-1 (y=600)
    act(() => {
      useExportStore.getState().setCropBounds(
        { west: -1, north: 1, east: 1, south: -1 },
        10
      )
    })

    render(<CropOverlay />)

    const seHandle = screen.getByTestId('crop-handle-se')
    fireEvent.pointerDown(seHandle, { button: 0, clientX: 600, clientY: 600, pointerId: 1 })
    fireEvent.pointerMove(seHandle, { clientX: 700, clientY: 800, pointerId: 1 })
    fireEvent.pointerUp(seHandle, { clientX: 700, clientY: 800, pointerId: 1 })

    const updated = useExportStore.getState().cropBounds
    expect(updated).not.toBeNull()
    expect(updated!.west).toBeCloseTo(-1, 5)
    expect(updated!.north).toBeCloseTo(1, 5)
    expect(updated!.east).toBeCloseTo(2, 5) // x=700 -> lng=2
    expect(updated!.south).toBeCloseTo(-3, 5) // y=800 -> lat=-3
  })

  it('moves the crop bounds when dragging inside the crop rectangle', () => {
    // Initial rect: x=400..600, y=400..600
    act(() => {
      useExportStore.getState().setCropBounds(
        { west: -1, north: 1, east: 1, south: -1 },
        10
      )
    })

    render(<CropOverlay />)

    const cropRect = screen.getByTestId('crop-rect')
    // Drag center (500, 500) by +100px right, +50px down -> x=500..700, y=450..650
    fireEvent.pointerDown(cropRect, { button: 0, clientX: 500, clientY: 500, pointerId: 1 })
    fireEvent.pointerMove(cropRect, { clientX: 600, clientY: 550, pointerId: 1 })
    fireEvent.pointerUp(cropRect, { clientX: 600, clientY: 550, pointerId: 1 })

    const updated = useExportStore.getState().cropBounds
    expect(updated).not.toBeNull()
    expect(updated!.west).toBeCloseTo(0, 5) // x=500 -> lng=0
    expect(updated!.east).toBeCloseTo(2, 5) // x=700 -> lng=2
    expect(updated!.north).toBeCloseTo(0.5, 5) // y=450 -> lat=0.5
    expect(updated!.south).toBeCloseTo(-1.5, 5) // y=650 -> lat=-1.5
  })
})
