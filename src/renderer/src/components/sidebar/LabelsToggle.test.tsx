// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { StyleSpecification } from 'maplibre-gl'
import LabelsToggle from './LabelsToggle'
import { useMapStore } from '../../stores/mapStore'

vi.mock('maplibre-gl', () => ({
  setWorkerUrl: () => {},
  setMaxParallelImageRequests: () => {},
}))

const STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'water-fill', type: 'fill', paint: { 'fill-color': '#1191bd' } },
    {
      id: 'water-label',
      type: 'symbol',
      layout: { visibility: 'visible' },
      paint: { 'text-color': '#000000' },
    },
    {
      id: 'road-label',
      type: 'symbol',
      layout: { visibility: 'visible' },
      paint: { 'text-color': '#000000' },
    },
  ],
} as unknown as StyleSpecification

const LAYER_MAP = {
  water: { fill: ['water-fill'], casing: [], labels: ['water-label'] },
  road: { fill: [], casing: [], labels: ['road-label'] },
}

describe('LabelsToggle', () => {
  beforeEach(() => {
    useMapStore.setState({
      style: STYLE,
      layerMap: LAYER_MAP,
      labelsHidden: false,
      basemapUrl: 'https://tiles.openfreemap.org/styles/liberty',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a checked Labels toggle by default (labels visible)', () => {
    render(<LabelsToggle />)
    const box = screen.getByRole('checkbox', { name: /labels/i }) as HTMLInputElement
    expect(box.checked).toBe(true)
  })

  it('hides every category label layer when checked', () => {
    render(<LabelsToggle />)
    const box = screen.getByRole('checkbox', { name: /labels/i })
    act(() => {
      box.click()
    })
    expect(useMapStore.getState().labelsHidden).toBe(true)
    const style = useMapStore.getState().style!
    for (const id of ['water-label', 'road-label']) {
      const layer = style.layers.find((l) => l.id === id) as unknown as {
        layout?: Record<string, unknown>
      }
      expect(layer.layout?.visibility).toBe('none')
    }
  })

  it('shows every category label layer when unchecked again', () => {
    useMapStore.setState({ labelsHidden: true })
    const hidden = useMapStore.getState().setLabelsHidden
    act(() => {
      hidden(true)
    })
    render(<LabelsToggle />)
    const box = screen.getByRole('checkbox', { name: /labels/i })
    act(() => {
      box.click()
    })
    expect(useMapStore.getState().labelsHidden).toBe(false)
    const style = useMapStore.getState().style!
    for (const id of ['water-label', 'road-label']) {
      const layer = style.layers.find((l) => l.id === id) as unknown as {
        layout?: Record<string, unknown>
      }
      expect(layer.layout?.visibility).toBe('visible')
    }
  })

  it('resets when a new basemap style loads', () => {
    useMapStore.getState().setLabelsHidden(true)
    expect(useMapStore.getState().labelsHidden).toBe(true)
    act(() => {
      useMapStore.getState().styleLoaded(STYLE, LAYER_MAP)
    })
    expect(useMapStore.getState().labelsHidden).toBe(false)
  })
})
