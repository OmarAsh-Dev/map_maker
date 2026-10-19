import { beforeEach, describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { DEFAULT_STYLE_URL, useMapStore } from './mapStore'
import type { LayerMap } from '../lib/styleMap'

const LAYER_MAP: LayerMap = {
  water: { fill: ['water-fill'], casing: [], labels: ['water-label'] },
  'road.highway': { fill: ['road-highway'], casing: ['road-highway-casing'], labels: [] },
}

function makeStyle(waterFill: string, roadFill: string): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: 'water-fill', type: 'fill', paint: { 'fill-color': waterFill, 'fill-opacity': 1 } },
      { id: 'water-label', type: 'symbol', paint: { 'text-color': '#000000' } },
      { id: 'road-highway', type: 'line', paint: { 'line-color': roadFill, 'line-opacity': 1 } },
      { id: 'road-highway-casing', type: 'line', paint: { 'line-color': roadFill, 'line-opacity': 1 } },
    ],
  } as unknown as StyleSpecification
}

function paintOf(style: StyleSpecification, id: string): Record<string, unknown> {
  const layer = style.layers.find((entry) => entry.id === id) as unknown as {
    paint?: Record<string, unknown>
  }
  return layer?.paint ?? {}
}

beforeEach(() => {
  useMapStore.setState({
    style: null,
    layerMap: {},
    basemapUrl: DEFAULT_STYLE_URL,
    selectedCategoryId: null,
  })
})

describe('mapStore', () => {
  it('starts with no style and the default basemap url', () => {
    const state = useMapStore.getState()
    expect(state.style).toBeNull()
    expect(state.layerMap).toEqual({})
    expect(state.basemapUrl).toBe('https://tiles.openfreemap.org/styles/liberty')
    expect(state.selectedCategoryId).toBeNull()
  })

  it('patchCategory composes sequential patches (fill then opacity) in style', () => {
    useMapStore.getState().styleLoaded(makeStyle('#aaaaaa', '#eecc66'), LAYER_MAP)
    useMapStore.getState().patchCategory('water', { geometryFill: '#ff0000' })
    useMapStore.getState().patchCategory('water', { geometryOpacity: 0.5 })

    const style = useMapStore.getState().style as StyleSpecification
    expect(paintOf(style, 'water-fill')['fill-color']).toBe('#ff0000')
    expect(paintOf(style, 'water-fill')['fill-opacity']).toBe(0.5)
  })

  it('selectCategory sets and unsets the selected id', () => {
    useMapStore.getState().selectCategory('water')
    expect(useMapStore.getState().selectedCategoryId).toBe('water')

    useMapStore.getState().selectCategory(null)
    expect(useMapStore.getState().selectedCategoryId).toBeNull()
  })

  it('setBasemap replaces basemapUrl + layerMap, discards overridden style, and clears the selection', () => {
    useMapStore.getState().styleLoaded(makeStyle('#aaaaaa', '#eecc66'), LAYER_MAP)
    useMapStore.getState().patchCategory('water', { geometryFill: '#ff0000' })
    useMapStore.getState().selectCategory('water')

    const nextMap: LayerMap = { water: { fill: ['ocean'], casing: [], labels: [] } }
    useMapStore
      .getState()
      .setBasemap('https://tiles.openfreemap.org/styles/bright', nextMap)

    const state = useMapStore.getState()
    expect(state.basemapUrl).toBe('https://tiles.openfreemap.org/styles/bright')
    expect(state.layerMap).toBe(nextMap)
    expect(state.style).toBeNull()
    expect(state.selectedCategoryId).toBeNull()

    const fresh = {
      version: 8,
      sources: {},
      layers: [{ id: 'ocean', type: 'fill', paint: { 'fill-color': '#123456', 'fill-opacity': 1 } }],
    } as unknown as StyleSpecification
    useMapStore.getState().styleLoaded(fresh, nextMap)
    useMapStore.getState().patchCategory('water', { geometryFill: '#00ff00' })

    const style = useMapStore.getState().style as StyleSpecification
    expect(paintOf(style, 'ocean')['fill-color']).toBe('#00ff00')
  })
})
