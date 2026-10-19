import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { applyCategoryPatch } from './styleMap'
import type { LayerMap } from './styleMap'
import { applyPassMask, exportGroups } from './maskPasses'

const MAP: LayerMap = {
  water: { fill: ['water-fill'], casing: [], labels: ['water-label'] },
  'road.highway': { fill: ['road-highway'], casing: ['road-highway-casing'], labels: ['road-highway-label'] },
  poi: { fill: [], casing: [], labels: ['poi-icon', 'poi-label'] },
}

const baseStyle = { version: 8, sources: {}, layers: [
  { id: 'bg', type: 'background' },
  { id: 'water-fill', type: 'fill', layout: { visibility: 'none' }, paint: { 'fill-color': '#aaaaaa', 'fill-opacity': 1 } },
  { id: 'water-label', type: 'symbol', layout: { visibility: 'none' }, paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-opacity': 1, 'icon-color': '#000000' } },
  { id: 'poi-icon', type: 'symbol', paint: { 'icon-color': '#555555', 'icon-opacity': 1 } },
  { id: 'poi-label', type: 'symbol', paint: { 'text-color': '#333333' } },
  { id: 'road-highway-casing', type: 'line', paint: { 'line-color': '#777777', 'line-opacity': 1 } },
  { id: 'road-highway', type: 'line', paint: { 'line-color': '#eecc66', 'line-opacity': 1 } },
  { id: 'road-highway-label', type: 'symbol', paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-opacity': 1 } },
] } as unknown as StyleSpecification

function layerOf(style: StyleSpecification, id: string): Record<string, unknown> {
  return style.layers.find((entry) => entry.id === id) as unknown as Record<string, unknown>
}

function paintOf(style: StyleSpecification, id: string): Record<string, unknown> {
  return (layerOf(style, id)?.paint as Record<string, unknown> | undefined) ?? {}
}

function layoutOf(style: StyleSpecification, id: string): Record<string, unknown> {
  return (layerOf(style, id)?.layout as Record<string, unknown> | undefined) ?? {}
}

describe('applyPassMask', () => {
  it('returns the style unchanged for the flat pass without mutating the input', () => {
    const snapshot = JSON.parse(JSON.stringify(baseStyle))
    const masked = applyPassMask(baseStyle, MAP, { type: 'flat' })

    expect(masked).not.toBe(baseStyle)
    expect(masked.layers).toEqual(baseStyle.layers)
    expect(baseStyle).toEqual(snapshot)
  })

  it('geometry pass shows only the group fill and casing layers and never unhides pre-hidden layers', () => {
    const snapshot = JSON.parse(JSON.stringify(baseStyle))
    const masked = applyPassMask(baseStyle, MAP, { type: 'geometry', groupId: 'road.highway' })

    expect(layoutOf(masked, 'road-highway').visibility).toBe('visible')
    expect(layoutOf(masked, 'road-highway-casing').visibility).toBe('visible')
    expect(layoutOf(masked, 'water-fill').visibility).toBe('none')
    expect(layoutOf(masked, 'water-label').visibility).toBe('none')
    expect(layoutOf(masked, 'road-highway-label').visibility).toBe('none')
    expect(layoutOf(masked, 'poi-icon').visibility).toBe('none')
    expect(layoutOf(masked, 'bg').visibility).toBe('none')
    expect(baseStyle).toEqual(snapshot)

    const hiddenRoad = applyCategoryPatch(baseStyle, MAP, 'road.highway', { visible: false })
    const maskedHidden = applyPassMask(hiddenRoad, MAP, { type: 'geometry', groupId: 'road.highway' })

    expect(layoutOf(maskedHidden, 'road-highway').visibility).toBe('none')
    expect(layoutOf(maskedHidden, 'road-highway-casing').visibility).toBe('none')
  })

  it('labels pass hides geometry, keeps in-group label paint, zeroes out-of-group symbols, and never unhides', () => {
    const snapshot = JSON.parse(JSON.stringify(baseStyle))
    const masked = applyPassMask(baseStyle, MAP, { type: 'labels', groupId: 'road.highway' })

    expect(layoutOf(masked, 'road-highway').visibility).toBe('none')
    expect(layoutOf(masked, 'road-highway-casing').visibility).toBe('none')
    expect(layoutOf(masked, 'water-fill').visibility).toBe('none')
    expect(layoutOf(masked, 'road-highway-label').visibility).toBe('visible')
    expect(paintOf(masked, 'road-highway-label')['text-color']).toBe('#000000')
    expect(paintOf(masked, 'road-highway-label')['text-opacity']).toBe(1)
    expect(layoutOf(masked, 'water-label').visibility).toBe('none')
    expect(baseStyle).toEqual(snapshot)

    const waterShown = applyCategoryPatch(baseStyle, MAP, 'water', { visible: true })
    const maskedShown = applyPassMask(waterShown, MAP, { type: 'labels', groupId: 'road.highway' })

    expect(layoutOf(maskedShown, 'water-label').visibility).toBe('visible')
    expect(paintOf(maskedShown, 'water-label')['text-opacity']).toBe(0)
  })

  it('labels pass forces icon and text opacity to 0 on out-of-group symbols lacking explicit opacity props', () => {
    const masked = applyPassMask(baseStyle, MAP, { type: 'labels', groupId: 'road.highway' })

    expect(layoutOf(masked, 'poi-label').visibility).toBe('visible')
    expect(paintOf(masked, 'poi-label')['text-opacity']).toBe(0)
    expect(paintOf(masked, 'poi-label')['icon-opacity']).toBe(0)
    expect(paintOf(masked, 'poi-icon')['icon-opacity']).toBe(0)
    expect(paintOf(masked, 'poi-icon')['text-opacity']).toBe(0)
  })
})

describe('exportGroups', () => {
  it('returns visible categories ordered bottom to top by first layer index', () => {
    const groups = exportGroups(MAP, baseStyle)

    expect(groups).toEqual([
      { id: 'poi', label: 'Points of interest' },
      { id: 'road.highway', label: 'Highway' },
    ])
  })

  it('includes a category once its layers become visible again', () => {
    const waterShown = applyCategoryPatch(baseStyle, MAP, 'water', { visible: true })
    const groups = exportGroups(MAP, waterShown)

    expect(groups).toEqual([
      { id: 'water', label: 'Water' },
      { id: 'poi', label: 'Points of interest' },
      { id: 'road.highway', label: 'Highway' },
    ])
  })
})
