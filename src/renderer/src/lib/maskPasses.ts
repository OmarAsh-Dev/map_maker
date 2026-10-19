import type { StyleSpecification } from 'maplibre-gl'
import { CATEGORY_GROUPS } from './categories'
import type { LayerMap } from './styleMap'

export type PassKind =
  | { type: 'flat' }
  | { type: 'geometry'; groupId: string }
  | { type: 'labels'; groupId: string }

interface LooseLayer {
  id: string
  type?: string
  layout?: Record<string, unknown>
  paint?: Record<string, unknown>
}

interface LooseStyle {
  layers?: LooseLayer[]
}

interface CategorySets {
  fill: Set<string>
  casing: Set<string>
  labels: Set<string>
}

function cloneStyle(style: StyleSpecification): StyleSpecification {
  return JSON.parse(JSON.stringify(style)) as StyleSpecification
}

function layersOf(style: StyleSpecification): LooseLayer[] {
  return (style as unknown as LooseStyle).layers ?? []
}

function categorySets(layerMap: LayerMap, groupId: string): CategorySets {
  const entry = layerMap[groupId]
  return {
    fill: new Set(entry?.fill ?? []),
    casing: new Set(entry?.casing ?? []),
    labels: new Set(entry?.labels ?? []),
  }
}

function hide(layer: LooseLayer): void {
  if (!layer.layout) layer.layout = {}
  layer.layout.visibility = 'none'
}

function isHidden(layer: LooseLayer): boolean {
  return layer.layout?.visibility === 'none'
}

function showUnlessHidden(layer: LooseLayer): void {
  if (isHidden(layer)) return
  if (!layer.layout) layer.layout = {}
  layer.layout.visibility = 'visible'
}

function setPaint(layer: LooseLayer, prop: string, value: unknown): void {
  if (!layer.paint) layer.paint = {}
  layer.paint[prop] = value
}

export function applyPassMask(
  style: StyleSpecification,
  layerMap: LayerMap,
  pass: PassKind
): StyleSpecification {
  const next = cloneStyle(style)
  if (pass.type === 'flat') return next

  const { fill, casing, labels } = categorySets(layerMap, pass.groupId)
  const layers = layersOf(next)

  if (pass.type === 'geometry') {
    const keep = new Set([...fill, ...casing])
    for (const layer of layers) {
      if (keep.has(layer.id)) showUnlessHidden(layer)
      else hide(layer)
    }
    return next
  }

  for (const layer of layers) {
    if (layer.type !== 'symbol') {
      hide(layer)
      continue
    }
    if (isHidden(layer)) continue
    if (!layer.layout) layer.layout = {}
    layer.layout.visibility = 'visible'
    if (!labels.has(layer.id)) {
      setPaint(layer, 'icon-opacity', 0)
      setPaint(layer, 'text-opacity', 0)
    }
  }
  return next
}

export function exportGroups(
  layerMap: LayerMap,
  style: StyleSpecification
): { id: string; label: string }[] {
  const layers = layersOf(style)
  const indexOf = new Map(layers.map((layer, index): [string, number] => [layer.id, index]))

  const labelOf = new Map<string, string>()
  for (const group of CATEGORY_GROUPS) {
    labelOf.set(group.id, group.label)
    for (const child of group.children) labelOf.set(child.id, child.label)
  }

  const firstIndex = new Map<string, number>()
  for (const [id, entry] of Object.entries(layerMap)) {
    let min: number | null = null
    let anyVisible = false
    for (const layerId of [...entry.fill, ...entry.casing, ...entry.labels]) {
      const index = indexOf.get(layerId)
      if (index === undefined) continue
      if (min === null || index < min) min = index
      if (layers[index].layout?.visibility !== 'none') anyVisible = true
    }
    if (min !== null && anyVisible) firstIndex.set(id, min)
  }

  return [...firstIndex.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => ({ id, label: labelOf.get(id) ?? id }))
}
