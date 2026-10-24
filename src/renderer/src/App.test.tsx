// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { StyleSpecification } from 'maplibre-gl'
import App from './App'
import { useMapStore } from './stores/mapStore'
import { useExportStore } from './stores/exportStore'

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

it('renders the Map Maker title and logo', () => {
  render(<App />)
  expect(screen.getByRole('heading', { level: 1, name: 'Map Maker' })).toBeInTheDocument()
  expect(screen.getAllByTestId('app-logo').length).toBeGreaterThanOrEqual(1)
  expect(screen.queryByText('map_maker')).not.toBeInTheDocument()
})

describe('crop mode toggle', () => {
  afterEach(() => {
    useExportStore.setState({ cropMode: false, cropBounds: null, dialogOpen: false })
  })

  it('toggles crop mode off via the Done selecting button', () => {
    render(<App />)
    act(() => {
      useExportStore.getState().setCropMode(true)
    })
    expect(screen.getByText('Done selecting')).toBeInTheDocument()

    act(() => {
      screen.getByText('Done selecting').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    expect(useExportStore.getState().cropMode).toBe(false)
  })

  it('keeps the crop toolbar above the crop overlay so Done selecting stays clickable in a real browser', () => {
    // jsdom performs no hit-testing, so this pins the stacking contract the
    // overlay (z-20, inset-0) must not cover the toolbar: the toolbar must sit
    // strictly above z-20 or clicks land on the overlay and start a drag.
    render(<App />)
    const button = screen.getByText('Select area')
    const toolbar = button.closest('div')
    expect(toolbar?.className).toMatch(/\bz-30\b/)
  })
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
