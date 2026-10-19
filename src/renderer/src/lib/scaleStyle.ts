import type { StyleSpecification } from 'maplibre-gl'

// px-denominated style props that must scale with the export/view ratio so the
// output proportions match what the user sees on screen (tile geometry already
// scales with zoom; line widths and label sizes do not).
const PAINT_PX_PROPS = [
  'line-width',
  'line-offset',
  'line-gap-width',
  'text-halo-width',
  'circle-radius',
  'circle-stroke-width',
]
const LAYOUT_PX_PROPS = ['text-size', 'icon-size']

function scaleValue(value: unknown, factor: number): unknown {
  if (typeof value === 'number') return value * factor
  if (Array.isArray(value)) return ['*', factor, value]
  return value
}

export function scaleStyleForExport(
  style: StyleSpecification,
  factor: number
): StyleSpecification {
  const next = JSON.parse(JSON.stringify(style)) as StyleSpecification
  if (factor === 1) return next
  for (const layer of (next as unknown as { layers?: Array<{
    paint?: Record<string, unknown>
    layout?: Record<string, unknown>
  }> }).layers ?? []) {
    for (const prop of PAINT_PX_PROPS) {
      if (layer.paint && layer.paint[prop] !== undefined) {
        layer.paint[prop] = scaleValue(layer.paint[prop], factor)
      }
    }
    for (const prop of LAYOUT_PX_PROPS) {
      if (layer.layout && layer.layout[prop] !== undefined) {
        layer.layout[prop] = scaleValue(layer.layout[prop], factor)
      }
    }
  }
  return next
}
