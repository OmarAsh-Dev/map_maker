// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { StyleSpecification } from 'maplibre-gl'
import App from './App'
import { useMapStore } from './stores/mapStore'

const { mapInstances } = vi.hoisted(() => ({
  mapInstances: [] as Array<{ setStyle: Mock; remove: Mock }>,
}))

vi.mock('maplibre-gl', () => ({
  Map: class {
    setStyle = vi.fn()
    remove = vi.fn()
    constructor() {
      mapInstances.push(this)
    }
    on() {
      return this
    }
  },
  setWorkerUrl: () => {},
  setMaxParallelImageRequests: () => {},
}))

const STYLE_A = {
  version: 8,
  sources: {},
  layers: [{ id: 'water-fill', type: 'fill', paint: { 'fill-color': '#1191bd' } }],
} as unknown as StyleSpecification

const STYLE_B = {
  version: 8,
  sources: {},
  layers: [{ id: 'water-fill', type: 'fill', paint: { 'fill-color': '#ff0000' } }],
} as unknown as StyleSpecification

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    listPresets: async () => [],
    onExportProgress: () => () => {}
  }
  mapInstances.length = 0
  useMapStore.setState({ style: null, layerMap: {}, selectedCategoryId: null })
})

afterEach(() => {
  cleanup()
})

it('renders the map_maker title', () => {
  render(<App />)
  expect(screen.getByText('map_maker')).toBeInTheDocument()
})

describe('store to map style sync', () => {
  it('does not call setStyle while the store style is null', () => {
    render(<App />)
    const map = mapInstances[mapInstances.length - 1]
    expect(map).toBeDefined()
    expect(map.setStyle).not.toHaveBeenCalled()
  })

  it('applies store style changes to the live map via setStyle', () => {
    render(<App />)
    const map = mapInstances[mapInstances.length - 1]

    act(() => {
      useMapStore.getState().styleLoaded(STYLE_A, {})
    })
    expect(map.setStyle).toHaveBeenCalledTimes(1)
    expect(map.setStyle).toHaveBeenCalledWith(STYLE_A)

    act(() => {
      useMapStore.getState().styleLoaded(STYLE_B, {})
    })
    expect(map.setStyle).toHaveBeenCalledTimes(2)
    expect(map.setStyle).toHaveBeenCalledWith(STYLE_B)
  })

  it('skips re-applying the identical style object to the live map', () => {
    render(<App />)
    const map = mapInstances[mapInstances.length - 1]

    act(() => {
      useMapStore.getState().styleLoaded(STYLE_A, {})
    })
    act(() => {
      useMapStore.getState().styleLoaded(STYLE_A, {})
    })

    expect(map.setStyle).toHaveBeenCalledTimes(1)
  })
})

describe('basemap selection', () => {
  it('lists the OpenFreeMap styles with Liberty selected by default', () => {
    render(<App />)
    const select = screen.getByLabelText('Basemap style') as HTMLSelectElement
    expect(select.value).toBe('https://tiles.openfreemap.org/styles/liberty')
    const labels = Array.from(select.options).map((option) => option.textContent)
    expect(labels).toEqual(['Liberty', 'Bright', 'Positron', 'Dark', 'Fiord'])
  })

  it('remounts MapCanvas for the chosen style and resets the store overrides', () => {
    render(<App />)
    const instancesBefore = mapInstances.length

    const select = screen.getByLabelText('Basemap style') as HTMLSelectElement
    act(() => {
      select.value = 'https://tiles.openfreemap.org/styles/bright'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(useMapStore.getState().basemapUrl).toBe('https://tiles.openfreemap.org/styles/bright')
    expect(useMapStore.getState().style).toBeNull()
    expect(useMapStore.getState().layerMap).toEqual({})
    expect(mapInstances.length).toBe(instancesBefore + 1)
    expect(mapInstances[instancesBefore - 1].remove).toHaveBeenCalled()
  })
})
