import type { StyleSpecification } from 'maplibre-gl'

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
  if (layer.type === 'fill') return 'fill-color'
  if (layer.type === 'line') return 'line-color'
  return null
}

function geometryStrokeProp(layer: LooseLayer): string | null {
  if (layer.type === 'line') return 'line-color'
  if (layer.type === 'fill') return 'fill-outline-color'
  return null
}

function geometryOpacityProp(layer: LooseLayer): string | null {
  if (layer.type === 'fill') return 'fill-opacity'
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

export function applyCategoryPatch(
  style: StyleSpecification,
  layerMap: LayerMap,
  categoryId: string,
  patch: CategoryPatch
): StyleSpecification {
  const next = cloneStyle(style)
  const entry = layerMap[categoryId]
  if (!entry) return next
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

function readProp(layers: LooseLayer[], propFor: (layer: LooseLayer) => string | null): unknown[] {
  const values: unknown[] = []
  for (const layer of layers) {
    const prop = propFor(layer)
    if (!prop) continue
    const value = layer.paint?.[prop]
    if (value !== undefined) values.push(value)
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

export function readCategory(
  style: StyleSpecification,
  layerMap: LayerMap,
  categoryId: string
): CategoryState {
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
  const layers = layersOf(style)
  const fill = resolveLayers(layers, entry.fill)
  const casing = resolveLayers(layers, entry.casing)
  const labels = resolveLayers(layers, entry.labels)
  const geometry = [...fill, ...casing]

  return {
    geometryFill: singleVal<string>(readProp(fill, geometryFillProp)),
    geometryStroke: singleVal<string>(readProp(casing, geometryStrokeProp)),
    geometryOpacity: singleVal<number>(readProp(geometry, geometryOpacityProp)),
    labelFill: singleVal<string>(readProp(labels, () => 'text-color')),
    labelStroke: singleVal<string>(readProp(labels, () => 'text-halo-color')),
    labelOpacity: singleVal<number>(readProp(labels, () => 'text-opacity')),
    labelIconColor: singleVal<string>(readProp(labels, () => 'icon-color')),
    visible: allVisible([...geometry, ...labels]),
    geometryVisible: allVisible(geometry),
    labelVisible: allVisible(labels),
  }
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
