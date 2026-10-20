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
  if (Array.isArray(value)) return scaleExpression(value, factor)
  return value
}

function containsZoom(expr: unknown[]): boolean {
  return expr.some(
    (part) => Array.isArray(part) && part[0] === 'zoom'
  )
}

// MapLibre forbids "zoom" anywhere except as the input of a top-level
// "interpolate"/"step", so a px prop holding a zoom expression cannot simply
// be wrapped in ["*", factor, expr]. Instead, scale the interpolation OUTPUTS
// (the values at each stop) and leave the stops/zoom structure untouched.
function scaleExpression(expr: unknown[], factor: number): unknown {
  if (expr[0] === 'interpolate' && Array.isArray(expr[2]) && expr[2][0] === 'zoom') {
    const out: unknown[] = [expr[0], expr[1], expr[2]]
    for (let i = 3; i < expr.length; i += 2) {
      out.push(expr[i]) // stop
      out.push(scaleValue(expr[i + 1], factor)) // value
    }
    return out
  }
  if (expr[0] === 'step' && Array.isArray(expr[1]) && expr[1][0] === 'zoom') {
    const out: unknown[] = [expr[0], expr[1], scaleValue(expr[2], factor)]
    for (let i = 3; i < expr.length; i += 2) {
      out.push(expr[i]) // stop
      out.push(scaleValue(expr[i + 1], factor)) // value
    }
    return out
  }
  if (!containsZoom(expr)) {
    return ['*', factor, expr]
  }
  // zoom in an unexpected position: leave the expression untouched rather
  // than emit an invalid style
  return expr
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
