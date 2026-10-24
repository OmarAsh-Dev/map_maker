import type { StyleSpecification } from 'maplibre-gl'
import { CATEGORY_GROUPS } from './categories'

export interface CategoryLayers {
  fill: string[]
  casing: string[]
  labels: string[]
}

export type LayerMap = Record<string, CategoryLayers>

export interface CategoryPatch {
  geometryFill?: string
  geometryStroke?: string
  geometryOpacity?: number
  labelFill?: string
  labelStroke?: string
  labelOpacity?: number
  labelIconColor?: string
  visible?: boolean
  geometryVisible?: boolean
  labelVisible?: boolean
  labelIconVisible?: boolean
}

export type Val<T> = T | 'mixed'

export interface CategoryState {
  geometryFill: Val<string>
  geometryStroke: Val<string>
  geometryOpacity: Val<number>
  labelFill: Val<string>
  labelStroke: Val<string>
  labelOpacity: Val<number>
  labelIconColor: Val<string>
  visible: boolean
  geometryVisible: boolean
  labelVisible: boolean
}

interface LooseLayer {
  id: string
  type?: string
  layout?: Record<string, unknown>
  paint?: Record<string, unknown>
}

interface LooseStyle {
  layers?: LooseLayer[]
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = (((h % 360) + 360) % 360) / 360
  const sat = Math.max(0, Math.min(1, s / 100))
  const light = Math.max(0, Math.min(1, l / 100))
  if (sat === 0) {
    const gray = light * 255
    return [gray, gray, gray]
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const hue2rgb = (t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return [hue2rgb(hue + 1 / 3) * 255, hue2rgb(hue) * 255, hue2rgb(hue - 1 / 3) * 255]
}

export function normalizeColorToHex(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase()
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed)
    if (shortHex) {
      return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase()
    }
    const rgbMatch =
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(trimmed)
    if (rgbMatch) {
      return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]))
    }
    const hslMatch =
      /^hsla?\(\s*([-\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(trimmed)
    if (hslMatch) {
      const [r, g, b] = hslToRgb(Number(hslMatch[1]), Number(hslMatch[2]), Number(hslMatch[3]))
      return rgbToHex(r, g, b)
    }
    return null
  }
  if (Array.isArray(value)) {
    if (value[0] === 'interpolate' && value.length >= 5) {
      for (let i = 4; i < value.length; i += 2) {
        const parsed = normalizeColorToHex(value[i])
        if (parsed) return parsed
      }
    }
    if (value[0] === 'step' && value.length >= 3) {
      const parsed = normalizeColorToHex(value[2])
      if (parsed) return parsed
    }
    if (value[0] === 'match' && value.length >= 4) {
      for (let i = 3; i < value.length; i += 2) {
        const parsed = normalizeColorToHex(value[i])
        if (parsed) return parsed
      }
      const fallback = normalizeColorToHex(value[value.length - 1])
      if (fallback) return fallback
    }
  }
  return null
}

function cloneStyle(style: StyleSpecification): StyleSpecification {
  return JSON.parse(JSON.stringify(style)) as StyleSpecification
}

function layersOf(style: StyleSpecification): LooseLayer[] {
  return (style as unknown as LooseStyle).layers ?? []
}

function resolveLayers(layers: LooseLayer[], ids: string[]): LooseLayer[] {
  const byId = new Map(layers.map((layer): [string, LooseLayer] => [layer.id, layer]))
  const found: LooseLayer[] = []
  for (const id of ids) {
    const layer = byId.get(id)
    if (layer) found.push(layer)
  }
  return found
}

function geometryFillProp(layer: LooseLayer): string | null {
  if (layer.type === 'background') return 'background-color'
  if (layer.type === 'fill') return 'fill-color'
  if (layer.type === 'fill-extrusion') return 'fill-extrusion-color'
  if (layer.type === 'line') return 'line-color'
  return null
}

function geometryStrokeProp(layer: LooseLayer): string | null {
  if (layer.type === 'line') return 'line-color'
  if (layer.type === 'fill') return 'fill-outline-color'
  return null
}

function geometryOpacityProp(layer: LooseLayer): string | null {
  if (layer.type === 'background') return 'background-opacity'
  if (layer.type === 'fill') return 'fill-opacity'
  if (layer.type === 'fill-extrusion') return 'fill-extrusion-opacity'
  if (layer.type === 'line') return 'line-opacity'
  return null
}

function setPaint(layer: LooseLayer, prop: string, value: unknown): void {
  if (!layer.paint) layer.paint = {}
  layer.paint[prop] = value
}

function setVisibility(layer: LooseLayer, visible: boolean): void {
  if (!layer.layout) layer.layout = {}
  layer.layout.visibility = visible ? 'visible' : 'none'
}

function isLayerVisible(layer: LooseLayer): boolean {
  return layer.layout?.visibility !== 'none'
}

function hasAnyLayers(entry: CategoryLayers | undefined): entry is CategoryLayers {
  return Boolean(entry && (entry.fill.length > 0 || entry.casing.length > 0 || entry.labels.length > 0))
}

function mergeCategoryLayers(entries: CategoryLayers[]): CategoryLayers {
  const fill = new Set<string>()
  const casing = new Set<string>()
  const labels = new Set<string>()
  for (const entry of entries) {
    for (const id of entry.fill) fill.add(id)
    for (const id of entry.casing) casing.add(id)
    for (const id of entry.labels) labels.add(id)
  }
  return { fill: [...fill], casing: [...casing], labels: [...labels] }
}

export function applyCategoryPatch(
  style: StyleSpecification,
  layerMap: LayerMap,
  categoryId: string,
  patch: CategoryPatch
): StyleSpecification {
  const next = cloneStyle(style)
  const group = CATEGORY_GROUPS.find((g) => g.id === categoryId)
  const entries: CategoryLayers[] = []
  if (layerMap[categoryId]) entries.push(layerMap[categoryId])
  if (group && group.children.length > 0) {
    for (const child of group.children) {
      if (layerMap[child.id]) entries.push(layerMap[child.id])
    }
  }
  if (entries.length === 0) return next
  const entry = mergeCategoryLayers(entries)
  const layers = layersOf(next)
  const fill = resolveLayers(layers, entry.fill)
  const casing = resolveLayers(layers, entry.casing)
  const labels = resolveLayers(layers, entry.labels)
  const geometry = [...fill, ...casing]

  if (patch.geometryFill !== undefined) {
    for (const layer of fill) {
      const prop = geometryFillProp(layer)
      if (prop) setPaint(layer, prop, patch.geometryFill)
    }
  }
  if (patch.geometryStroke !== undefined) {
    for (const layer of casing) {
      const prop = geometryStrokeProp(layer)
      if (prop) setPaint(layer, prop, patch.geometryStroke)
    }
  }
  if (patch.geometryOpacity !== undefined) {
    for (const layer of geometry) {
      const prop = geometryOpacityProp(layer)
      if (prop) setPaint(layer, prop, patch.geometryOpacity)
    }
  }
  if (patch.labelFill !== undefined) {
    for (const layer of labels) setPaint(layer, 'text-color', patch.labelFill)
  }
  if (patch.labelStroke !== undefined) {
    for (const layer of labels) setPaint(layer, 'text-halo-color', patch.labelStroke)
  }
  if (patch.labelOpacity !== undefined) {
    for (const layer of labels) setPaint(layer, 'text-opacity', patch.labelOpacity)
  }
  if (patch.labelIconColor !== undefined) {
    for (const layer of labels) setPaint(layer, 'icon-color', patch.labelIconColor)
  }
  if (patch.visible !== undefined) {
    for (const layer of [...geometry, ...labels]) setVisibility(layer, patch.visible)
  }
  if (patch.geometryVisible !== undefined) {
    for (const layer of geometry) setVisibility(layer, patch.geometryVisible)
  }
  if (patch.labelVisible !== undefined) {
    for (const layer of labels) setVisibility(layer, patch.labelVisible)
  }
  if (patch.labelIconVisible !== undefined) {
    for (const layer of labels) setPaint(layer, 'icon-opacity', patch.labelIconVisible ? 1 : 0)
  }
  return next
}

function readProp(
  layers: LooseLayer[],
  propFor: (layer: LooseLayer) => string | null,
  isColor = false
): unknown[] {
  const values: unknown[] = []
  for (const layer of layers) {
    const prop = propFor(layer)
    if (!prop) continue
    const value = layer.paint?.[prop]
    if (value !== undefined) {
      values.push(isColor ? (normalizeColorToHex(value) ?? value) : value)
    }
  }
  return values
}

function singleVal<T>(values: unknown[]): Val<T> {
  if (values.length === 0) return 'mixed'
  const first = values[0]
  return values.every((value) => value === first) ? (first as T) : 'mixed'
}

function allVisible(layers: LooseLayer[]): boolean {
  return layers.every((layer) => isLayerVisible(layer))
}

function readDirectEntry(style: StyleSpecification, entry: CategoryLayers): CategoryState {
  const layers = layersOf(style)
  const fill = resolveLayers(layers, entry.fill)
  const casing = resolveLayers(layers, entry.casing)
  const labels = resolveLayers(layers, entry.labels)
  const geometry = [...fill, ...casing]

  return {
    geometryFill: singleVal<string>(readProp(fill, geometryFillProp, true)),
    geometryStroke: singleVal<string>(readProp(casing, geometryStrokeProp, true)),
    geometryOpacity: singleVal<number>(readProp(geometry, geometryOpacityProp)),
    labelFill: singleVal<string>(readProp(labels, () => 'text-color', true)),
    labelStroke: singleVal<string>(readProp(labels, () => 'text-halo-color', true)),
    labelOpacity: singleVal<number>(readProp(labels, () => 'text-opacity')),
    labelIconColor: singleVal<string>(readProp(labels, () => 'icon-color', true)),
    visible: allVisible([...geometry, ...labels]),
    geometryVisible: allVisible(geometry),
    labelVisible: allVisible(labels),
  }
}

export function readCategory(
  style: StyleSpecification,
  layerMap: LayerMap,
  categoryId: string
): CategoryState {
  const group = CATEGORY_GROUPS.find((g) => g.id === categoryId)
  if (group && group.children.length > 0) {
    const populatedChildren = group.children.filter((c) => hasAnyLayers(layerMap[c.id]))
    if (populatedChildren.length > 0) {
      const states = populatedChildren.map((c) => readDirectEntry(style, layerMap[c.id]!))
      const direct = layerMap[categoryId]
      if (hasAnyLayers(direct)) {
        const coveredFill = new Set(populatedChildren.flatMap((c) => layerMap[c.id]!.fill))
        const coveredCasing = new Set(populatedChildren.flatMap((c) => layerMap[c.id]!.casing))
        const coveredLabels = new Set(populatedChildren.flatMap((c) => layerMap[c.id]!.labels))
        const extra: CategoryLayers = {
          fill: direct.fill.filter((id) => !coveredFill.has(id)),
          casing: direct.casing.filter((id) => !coveredCasing.has(id)),
          labels: direct.labels.filter((id) => !coveredLabels.has(id)),
        }
        if (hasAnyLayers(extra)) {
          states.push(readDirectEntry(style, direct))
        }
      }
      return aggregateGroup(states)
    }
  }

  const entry = layerMap[categoryId]
  if (!entry) {
    return {
      geometryFill: 'mixed',
      geometryStroke: 'mixed',
      geometryOpacity: 'mixed',
      labelFill: 'mixed',
      labelStroke: 'mixed',
      labelOpacity: 'mixed',
      labelIconColor: 'mixed',
      visible: true,
      geometryVisible: true,
      labelVisible: true,
    }
  }
  return readDirectEntry(style, entry)
}

function aggVal<T>(values: Val<T>[]): Val<T> {
  const first = values[0]
  return values.every((value) => value === first) ? first : 'mixed'
}

export function aggregateGroup(states: CategoryState[]): CategoryState {
  if (states.length === 0) {
    return {
      geometryFill: 'mixed',
      geometryStroke: 'mixed',
      geometryOpacity: 'mixed',
      labelFill: 'mixed',
      labelStroke: 'mixed',
      labelOpacity: 'mixed',
      labelIconColor: 'mixed',
      visible: true,
      geometryVisible: true,
      labelVisible: true,
    }
  }
  return {
    geometryFill: aggVal(states.map((state) => state.geometryFill)),
    geometryStroke: aggVal(states.map((state) => state.geometryStroke)),
    geometryOpacity: aggVal(states.map((state) => state.geometryOpacity)),
    labelFill: aggVal(states.map((state) => state.labelFill)),
    labelStroke: aggVal(states.map((state) => state.labelStroke)),
    labelOpacity: aggVal(states.map((state) => state.labelOpacity)),
    labelIconColor: aggVal(states.map((state) => state.labelIconColor)),
    visible: states.every((state) => state.visible),
    geometryVisible: states.every((state) => state.geometryVisible),
    labelVisible: states.every((state) => state.labelVisible),
  }
}
