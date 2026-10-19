import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { CATEGORY_GROUPS } from './categories'
import { aggregateGroup, applyCategoryPatch, readCategory } from './styleMap'
import type { LayerMap } from './styleMap'

const FIXTURE_MAP: LayerMap = {
  'water': { fill: ['water-fill'], casing: [], labels: ['water-label'] },
  'road.highway': { fill: ['road-highway'], casing: ['road-highway-casing'], labels: ['road-highway-label'] },
}

const baseStyle = { version: 8, sources: {}, layers: [
  { id: 'bg', type: 'background' },
  { id: 'water-fill', type: 'fill', paint: { 'fill-color': '#aaaaaa', 'fill-opacity': 1 } },
  { id: 'water-label', type: 'symbol', layout: { visibility: 'visible' }, paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-opacity': 1, 'icon-color': '#000000' } },
  { id: 'road-highway-casing', type: 'line', paint: { 'line-color': '#777777', 'line-opacity': 1 } },
  { id: 'road-highway', type: 'line', paint: { 'line-color': '#eecc66', 'line-opacity': 1 } },
  { id: 'road-highway-label', type: 'symbol', paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-opacity': 1 } },
] } as unknown as StyleSpecification

function paintOf(style: StyleSpecification, id: string): Record<string, unknown> {
  const layer = style.layers.find((entry) => entry.id === id) as unknown as { paint?: Record<string, unknown> }
  return layer?.paint ?? {}
}

function layoutOf(style: StyleSpecification, id: string): Record<string, unknown> {
  const layer = style.layers.find((entry) => entry.id === id) as unknown as { layout?: Record<string, unknown> }
  return layer?.layout ?? {}
}

describe('applyCategoryPatch', () => {
  it('writes geometry fill to the fill slot layer without mutating the input style', () => {
    const snapshot = JSON.parse(JSON.stringify(baseStyle))
    const style = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'road.highway', { geometryFill: '#ff0000' })

    expect(paintOf(style, 'road-highway')['line-color']).toBe('#ff0000')
    expect(paintOf(style, 'road-highway-casing')['line-color']).toBe('#777777')
    expect(style).not.toBe(baseStyle)
    expect(baseStyle).toEqual(snapshot)
  })

  it('writes geometry stroke to the casing layer', () => {
    const style = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'road.highway', { geometryStroke: '#00ff00' })

    expect(paintOf(style, 'road-highway-casing')['line-color']).toBe('#00ff00')
    expect(paintOf(style, 'road-highway')['line-color']).toBe('#eecc66')
  })

  it('writes geometry opacity to both road geometry layers', () => {
    const style = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'road.highway', { geometryOpacity: 0.7 })

    expect(paintOf(style, 'road-highway')['line-opacity']).toBe(0.7)
    expect(paintOf(style, 'road-highway-casing')['line-opacity']).toBe(0.7)
  })

  it('writes water geometry fill as fill-color on the fill-type layer', () => {
    const style = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'water', { geometryFill: '#123456' })

    expect(paintOf(style, 'water-fill')['fill-color']).toBe('#123456')
  })

  it('writes label fill, stroke, and opacity to the label layer', () => {
    const style = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'road.highway', {
      labelFill: '#111111',
      labelStroke: '#222222',
      labelOpacity: 0.5,
    })
    const paint = paintOf(style, 'road-highway-label')

    expect(paint['text-color']).toBe('#111111')
    expect(paint['text-halo-color']).toBe('#222222')
    expect(paint['text-opacity']).toBe(0.5)
  })

  it('writes label icon color on the water label layer', () => {
    const style = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'water', { labelIconColor: '#333333' })

    expect(paintOf(style, 'water-label')['icon-color']).toBe('#333333')
  })

  it('hides all three road layers via visible false', () => {
    const style = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'road.highway', { visible: false })

    expect(layoutOf(style, 'road-highway')['visibility']).toBe('none')
    expect(layoutOf(style, 'road-highway-casing')['visibility']).toBe('none')
    expect(layoutOf(style, 'road-highway-label')['visibility']).toBe('none')
  })

  it('hides only the label layer via labelVisible false', () => {
    const style = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'road.highway', { labelVisible: false })

    expect(layoutOf(style, 'road-highway-label')['visibility']).toBe('none')
    expect(layoutOf(style, 'road-highway')['visibility']).not.toBe('none')
    expect(layoutOf(style, 'road-highway-casing')['visibility']).not.toBe('none')
  })

  it('hides water geometry and labels together via visible false', () => {
    const style = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'water', { visible: false })

    expect(layoutOf(style, 'water-fill')['visibility']).toBe('none')
    expect(layoutOf(style, 'water-label')['visibility']).toBe('none')
  })
})

describe('readCategory', () => {
  it('reads back the patched geometry fill color', () => {
    const patched = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'road.highway', { geometryFill: '#ff0000' })
    const state = readCategory(patched, FIXTURE_MAP, 'road.highway')

    expect(state.geometryFill).toBe('#ff0000')
  })

  it('reads the untouched road.highway state from the fixture', () => {
    const state = readCategory(baseStyle, FIXTURE_MAP, 'road.highway')

    expect(state.geometryFill).toBe('#eecc66')
    expect(state.geometryStroke).toBe('#777777')
    expect(state.geometryOpacity).toBe(1)
    expect(state.labelFill).toBe('#000000')
    expect(state.labelStroke).toBe('#ffffff')
    expect(state.labelOpacity).toBe(1)
    expect(state.labelIconColor).toBe('mixed')
    expect(state.visible).toBe(true)
    expect(state.geometryVisible).toBe(true)
    expect(state.labelVisible).toBe(true)
  })

  it('reads the untouched water state from the fixture', () => {
    const state = readCategory(baseStyle, FIXTURE_MAP, 'water')

    expect(state.geometryFill).toBe('#aaaaaa')
    expect(state.geometryStroke).toBe('mixed')
    expect(state.labelFill).toBe('#000000')
    expect(state.labelIconColor).toBe('#000000')
  })
})

describe('aggregateGroup', () => {
  it('returns mixed for untouched fixture sub-items with differing colors', () => {
    const water = readCategory(baseStyle, FIXTURE_MAP, 'water')
    const road = readCategory(baseStyle, FIXTURE_MAP, 'road.highway')
    const aggregated = aggregateGroup([water, road])

    expect(aggregated.geometryFill).toBe('mixed')
    expect(aggregated.geometryStroke).toBe('mixed')
    expect(aggregated.labelIconColor).toBe('mixed')
    expect(aggregated.visible).toBe(true)
    expect(aggregated.geometryVisible).toBe(true)
    expect(aggregated.labelVisible).toBe(true)
  })

  it('returns the shared value when sub-items agree', () => {
    const a = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'water', { geometryFill: '#ff0000' })
    const b = applyCategoryPatch(baseStyle, FIXTURE_MAP, 'road.highway', { geometryFill: '#ff0000' })
    const aggregated = aggregateGroup([
      readCategory(a, FIXTURE_MAP, 'water'),
      readCategory(b, FIXTURE_MAP, 'road.highway'),
    ])

    expect(aggregated.geometryFill).toBe('#ff0000')
  })

  it('reports visible false when any sub-item is hidden', () => {
    const hidden = readCategory(applyCategoryPatch(baseStyle, FIXTURE_MAP, 'water', { visible: false }), FIXTURE_MAP, 'water')
    const shown = readCategory(baseStyle, FIXTURE_MAP, 'road.highway')
    const aggregated = aggregateGroup([hidden, shown])

    expect(aggregated.visible).toBe(false)
    expect(aggregated.geometryFill).toBe('mixed')
  })
})

describe('CATEGORY_GROUPS', () => {
  it('contains the eight spec groups in sidebar order', () => {
    expect(CATEGORY_GROUPS.map((group) => group.id)).toEqual([
      'administrative',
      'landscape',
      'buildings',
      'poi',
      'road',
      'transit',
      'water',
      'background',
    ])
  })

  it('has exactly the spec road children', () => {
    const road = CATEGORY_GROUPS.find((group) => group.id === 'road')

    expect(road?.children.map((child) => child.label)).toEqual([
      'Highway',
      'Arterial',
      'Minor',
      'Service',
      'Street limits',
      'Path',
      'Others',
    ])
  })

  it('gives leaf groups no children', () => {
    for (const id of ['buildings', 'water', 'background']) {
      const group = CATEGORY_GROUPS.find((entry) => entry.id === id)
      expect(group?.children).toEqual([])
    }
  })

  it('gives every non-leaf group at least one child', () => {
    for (const group of CATEGORY_GROUPS) {
      if (group.id === 'buildings' || group.id === 'water' || group.id === 'background') continue
      expect(group.children.length).toBeGreaterThan(0)
    }
  })

  it('namespaces child category ids under their group id', () => {
    for (const group of CATEGORY_GROUPS) {
      for (const child of group.children) {
        expect(child.id.startsWith(`${group.id}.`)).toBe(true)
      }
    }
  })
})
