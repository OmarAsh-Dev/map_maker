import type { StyleSpecification } from 'maplibre-gl'
import { CATEGORY_GROUPS } from './categories'
import type { CategoryLayers, LayerMap } from './styleMap'

type Slot = keyof CategoryLayers

const GEOMETRY_TYPES = new Set(['fill', 'line', 'fill-extrusion', 'background', 'raster'])

const ROAD_TRIGGERS = ['road', 'bridge', 'tunnel', 'highway']

const ROAD_SUBS: Array<{ id: string; words: string[] }> = [
  { id: 'road.highway', words: ['motorway', 'trunk', 'link'] },
  { id: 'road.arterial', words: ['primary', 'secondary', 'tertiary', 'arterial'] },
  { id: 'road.street-limits', words: ['street_limit', 'street-limits', 'street_limiter'] },
  { id: 'road.minor', words: ['minor', 'street', 'residential', 'unclassified', 'living'] },
  { id: 'road.service', words: ['service'] },
  { id: 'road.path', words: ['path', 'pedestrian', 'footway', 'cycleway', 'steps', 'trail', 'piste'] },
  { id: 'road.highway', words: ['highway'] },
]

const POI_TRIGGERS = [
  'poi',
  'amenity',
  'shop',
  'retail',
  'landmark',
  'attraction',
  'monument',
  'historic',
  'tourism',
  'office',
  'station',
]

const TRANSIT_TRIGGERS = ['rail', 'transit', 'aeroway', 'airport', 'ferry', 'aerialway', 'bus', 'cablecar']

const ADMIN_TRIGGERS = ['boundary', 'label_country', 'label_state', 'label_city', 'label_town', 'label_village', 'admin']

const LANDSCAPE_TRIGGERS = ['landcover', 'landuse', 'park', 'forest', 'natural', 'wetland', 'wood', 'grass', 'sand', 'ice_', 'ice-', 'glacier']

function isCasingId(id: string): boolean {
  if (id.endsWith('-casing') || id.endsWith('_casing')) return true
  return /^(bridge|road)[-]/.test(id) && id.includes('casing')
}

function slotFor(type: string, id: string): Slot | null {
  if (type === 'symbol') return 'labels'
  if (!GEOMETRY_TYPES.has(type)) return null
  return isCasingId(id) ? 'casing' : 'fill'
}

function roadSubId(id: string): string {
  for (const sub of ROAD_SUBS) {
    if (sub.words.some((word) => id.includes(word))) return sub.id
  }
  return 'road.others'
}

function poiSubId(id: string): string {
  if (id.includes('transport') || id.includes('transit') || id.includes('station')) return 'poi.transport'
  if (id.includes('shop') || id.includes('retail')) return 'poi.shop'
  if (
    id.includes('landmark') ||
    id.includes('attraction') ||
    id.includes('monument') ||
    id.includes('historic') ||
    id.includes('tourism')
  ) {
    return 'poi.landmark'
  }
  return 'poi.amenity'
}

function transitSubId(id: string): string {
  if (id.includes('ferry')) return 'transit.ferry'
  if (id.includes('aerialway') || id.includes('cablecar')) return 'transit.aerialway'
  if (id.includes('bus')) return 'transit.bus'
  return 'transit.rail'
}

function adminSubId(id: string): string {
  if (id.includes('label_state') || id.includes('boundary_3') || id.includes('boundary_4') || id.includes('state')) {
    return 'administrative.state'
  }
  if (id.includes('label_city') || id.includes('label_town') || id.includes('label_village') || id.includes('settlement')) {
    return 'administrative.settlement'
  }
  return 'administrative.country'
}

function landscapeSubId(id: string): string {
  if (id.includes('park')) return 'landscape.park'
  if (id.includes('landuse')) return 'landscape.landuse'
  return 'landscape.landcover'
}

function categoriesForLayer(id: string): string[] {
  if (id.includes('background')) return ['background']
  if (id.includes('water')) return ['water']
  if (id.includes('building')) return ['buildings']
  if (id.includes('label_other')) return ['administrative.settlement', 'administrative']
  if (POI_TRIGGERS.some((word) => id.includes(word))) return [poiSubId(id), 'poi']
  if (TRANSIT_TRIGGERS.some((word) => id.includes(word))) return [transitSubId(id), 'transit']
  if (ROAD_TRIGGERS.some((word) => id.includes(word))) return [roadSubId(id), 'road']
  if (ADMIN_TRIGGERS.some((word) => id.includes(word))) return [adminSubId(id), 'administrative']
  if (LANDSCAPE_TRIGGERS.some((word) => id.includes(word))) return [landscapeSubId(id), 'landscape']
  return []
}

export function buildLayerMapFromStyle(style: StyleSpecification): LayerMap {
  const layerMap: LayerMap = {}
  for (const group of CATEGORY_GROUPS) {
    layerMap[group.id] = { fill: [], casing: [], labels: [] }
    for (const child of group.children) {
      layerMap[child.id] = { fill: [], casing: [], labels: [] }
    }
  }
  const layers = style.layers ?? []
  for (const layer of layers) {
    const id = layer.id.toLowerCase()
    const slot = slotFor(layer.type ?? '', id)
    if (!slot) continue
    const categories = layer.type === 'raster' ? ['background'] : categoriesForLayer(id)
    for (const categoryId of categories) {
      layerMap[categoryId]?.[slot].push(layer.id)
    }
  }
  return layerMap
}
