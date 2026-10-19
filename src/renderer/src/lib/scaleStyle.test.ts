import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { scaleStyleForExport } from './scaleStyle'

const style = {
  version: 8,
  sources: {},
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#f8f4f0' } },
    {
      id: 'road',
      type: 'line',
      paint: {
        'line-width': 2,
        'line-color': '#ffffff',
        'line-offset': ['interpolate', ['linear'], ['zoom'], 10, 0, 15, 3],
      },
      layout: {},
    },
    {
      id: 'road-label',
      type: 'symbol',
      layout: { 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 14], 'icon-size': 1 },
      paint: { 'text-halo-width': 1.5, 'text-color': '#000' },
    },
    {
      id: 'water',
      type: 'fill',
      paint: { 'fill-color': '#aad3df', 'fill-outline-color': '#5f98ac' },
    },
  ],
} as unknown as StyleSpecification

function paintOf(s: StyleSpecification, id: string): Record<string, unknown> {
  return (
    (s.layers.find((l) => l.id === id) as unknown as { paint?: Record<string, unknown> })?.paint ??
    {}
  )
}

function layoutOf(s: StyleSpecification, id: string): Record<string, unknown> {
  return (
    (s.layers.find((l) => l.id === id) as unknown as { layout?: Record<string, unknown> })
      ?.layout ?? {}
  )
}

describe('scaleStyleForExport', () => {
  it('multiplies numeric line-width, icon-size and halo-width by the factor', () => {
    const scaled = scaleStyleForExport(style, 4)
    expect(paintOf(scaled, 'road')['line-width']).toBe(8)
    expect(paintOf(scaled, 'road-label')['text-halo-width']).toBe(6)
    expect(layoutOf(scaled, 'road-label')['icon-size']).toBe(4)
  })

  it('wraps expression-valued px props in a multiply instead of overwriting them', () => {
    const scaled = scaleStyleForExport(style, 4)
    const offset = paintOf(scaled, 'road')['line-offset']
    expect(Array.isArray(offset)).toBe(true)
    expect((offset as unknown[])[0]).toBe('*')
    expect((offset as unknown[])[1]).toBe(4)
    expect((offset as unknown[])[2]).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      10,
      0,
      15,
      3,
    ])
    const textSize = layoutOf(scaled, 'road-label')['text-size']
    expect((textSize as unknown[])[0]).toBe('*')
    expect((textSize as unknown[])[2]).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      10,
      10,
      15,
      14,
    ])
  })

  it('does not touch colors or fill props', () => {
    const scaled = scaleStyleForExport(style, 4)
    expect(paintOf(scaled, 'water')['fill-color']).toBe('#aad3df')
    expect(paintOf(scaled, 'water')['fill-outline-color']).toBe('#5f98ac')
    expect(paintOf(scaled, 'road')['line-color']).toBe('#ffffff')
    expect(paintOf(scaled, 'bg')['background-color']).toBe('#f8f4f0')
  })

  it('returns an unchanged clone for factor 1 and never mutates the input', () => {
    const snapshot = JSON.stringify(style)
    const scaled = scaleStyleForExport(style, 1)
    expect(JSON.stringify(scaled)).toBe(snapshot)
    expect(JSON.stringify(style)).toBe(snapshot)
  })

  it('handles absent props gracefully', () => {
    const minimal = {
      version: 8,
      sources: {},
      layers: [{ id: 'x', type: 'fill', paint: {} }],
    } as unknown as StyleSpecification
    expect(() => scaleStyleForExport(minimal, 3)).not.toThrow()
  })
})
