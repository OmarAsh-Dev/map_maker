import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { CATEGORY_GROUPS } from './categories'
import { buildLayerMapFromStyle } from './layerMapBuilder'
import type { LayerMap } from './styleMap'

const FIXTURE_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
    { id: 'landcover_wood', type: 'fill', paint: { 'fill-color': '#d8e8cf' } },
    { id: 'landcover_ice', type: 'fill', paint: { 'fill-color': '#ffffff' } },
    { id: 'landuse_residential', type: 'fill', paint: { 'fill-color': '#e2eae9' } },
    { id: 'landuse_track', type: 'fill', paint: { 'fill-color': '#e0e0d0' } },
    { id: 'park', type: 'fill', paint: { 'fill-color': '#cfe6c9' } },
    { id: 'park_outline', type: 'line', paint: { 'line-color': '#9cc094' } },
    { id: 'water', type: 'fill', paint: { 'fill-color': '#aad3df' } },
    { id: 'waterway_river', type: 'line', paint: { 'line-color': '#aad3df' } },
    { id: 'water_name_line_label', type: 'symbol', paint: { 'text-color': '#5d7889' } },
    { id: 'building', type: 'fill', paint: { 'fill-color': '#e0dfdf' } },
    { id: 'building-3d', type: 'fill-extrusion', paint: {} },
    { id: 'road_motorway_casing', type: 'line', paint: { 'line-color': '#e892a2' } },
    { id: 'road_motorway', type: 'line', paint: { 'line-color': '#e892a2' } },
    { id: 'bridge_motorway', type: 'line', paint: { 'line-color': '#e892a2' } },
    { id: 'road_trunk_primary', type: 'line', paint: { 'line-color': '#f9b29c' } },
    { id: 'road_minor', type: 'line', paint: { 'line-color': '#ffffff' } },
    { id: 'road_service_track', type: 'line', paint: { 'line-color': '#ffffff' } },
    { id: 'road_path_pedestrian', type: 'line', paint: { 'line-color': '#cba783' } },
    { id: 'tunnel_path_pedestrian', type: 'line', paint: { 'line-color': '#cba783' } },
    { id: 'road_area_pattern', type: 'fill', paint: { 'fill-color': '#eeeeee' } },
    { id: 'road_one_way_arrow', type: 'symbol', paint: {} },
    { id: 'highway-name-minor', type: 'symbol', paint: { 'text-color': '#79818c' } },
    { id: 'highway-name-path', type: 'symbol', paint: { 'text-color': '#a98b6f' } },
    { id: 'road_major_rail', type: 'line', paint: { 'line-color': '#788a99' } },
    { id: 'tunnel_transit_rail', type: 'line', paint: { 'line-color': '#788a99' } },
    { id: 'aeroway_runway', type: 'line', paint: { 'line-color': '#d5d9df' } },
    { id: 'airport', type: 'symbol', paint: {} },
    { id: 'boundary_2', type: 'line', paint: { 'line-color': '#9a9a9a' } },
    { id: 'boundary_3', type: 'line', paint: { 'line-color': '#b0b0b0' } },
    { id: 'label_country_1', type: 'symbol', paint: { 'text-color': '#334c59' } },
    { id: 'label_state', type: 'symbol', paint: { 'text-color': '#6b7f8c' } },
    { id: 'label_city', type: 'symbol', paint: { 'text-color': '#1a1a1a' } },
    { id: 'poi_r20', type: 'symbol', paint: { 'text-color': '#5e808f' } },
    { id: 'poi_transit', type: 'symbol', paint: { 'text-color': '#5e808f' } },
    { id: 'natural_earth', type: 'raster', paint: {} },
    { id: 'label_other', type: 'symbol', paint: {} },
  ],
} as unknown as StyleSpecification

function hasEntry(layerMap: LayerMap, categoryId: string, slot: 'fill' | 'casing' | 'labels', layerId: string): boolean {
  return layerMap[categoryId]?.[slot].includes(layerId) ?? false
}

function allLayerIds(layerMap: LayerMap): string[] {
  const ids = new Set<string>()
  for (const entry of Object.values(layerMap)) {
    for (const id of [...entry.fill, ...entry.casing, ...entry.labels]) ids.add(id)
  }
  return [...ids]
}

describe('buildLayerMapFromStyle', () => {
  it('creates an entry for every group and child category', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    for (const group of CATEGORY_GROUPS) {
      expect(layerMap[group.id]).toEqual({ fill: expect.any(Array), casing: expect.any(Array), labels: expect.any(Array) })
      for (const child of group.children) {
        expect(layerMap[child.id]).toEqual({ fill: expect.any(Array), casing: expect.any(Array), labels: expect.any(Array) })
      }
    }
  })

  it('assigns water fills, waterway lines and water name labels to water', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    expect(hasEntry(layerMap, 'water', 'fill', 'water')).toBe(true)
    expect(hasEntry(layerMap, 'water', 'fill', 'waterway_river')).toBe(true)
    expect(hasEntry(layerMap, 'water', 'labels', 'water_name_line_label')).toBe(true)
    expect(hasEntry(layerMap, 'water', 'casing', 'water')).toBe(false)
  })

  it('assigns buildings including fill-extrusion 3d layers', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    expect(hasEntry(layerMap, 'buildings', 'fill', 'building')).toBe(true)
    expect(hasEntry(layerMap, 'buildings', 'fill', 'building-3d')).toBe(true)
  })

  it('assigns road layers to sub-categories by road type', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    expect(hasEntry(layerMap, 'road.highway', 'fill', 'road_motorway')).toBe(true)
    expect(hasEntry(layerMap, 'road.highway', 'fill', 'bridge_motorway')).toBe(true)
    expect(hasEntry(layerMap, 'road.highway', 'fill', 'road_trunk_primary')).toBe(true)
    expect(hasEntry(layerMap, 'road.highway', 'casing', 'road_motorway_casing')).toBe(true)
    expect(hasEntry(layerMap, 'road.minor', 'fill', 'road_minor')).toBe(true)
    expect(hasEntry(layerMap, 'road.service', 'fill', 'road_service_track')).toBe(true)
    expect(hasEntry(layerMap, 'road.path', 'fill', 'road_path_pedestrian')).toBe(true)
    expect(hasEntry(layerMap, 'road.path', 'fill', 'tunnel_path_pedestrian')).toBe(true)
    expect(hasEntry(layerMap, 'road.others', 'fill', 'road_area_pattern')).toBe(true)
    expect(hasEntry(layerMap, 'road.others', 'labels', 'road_one_way_arrow')).toBe(true)
    expect(hasEntry(layerMap, 'road.minor', 'labels', 'highway-name-minor')).toBe(true)
    expect(hasEntry(layerMap, 'road.path', 'labels', 'highway-name-path')).toBe(true)
  })

  it('unions child road layers into the road group entry', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    expect(hasEntry(layerMap, 'road', 'fill', 'road_motorway')).toBe(true)
    expect(hasEntry(layerMap, 'road', 'fill', 'road_path_pedestrian')).toBe(true)
    expect(hasEntry(layerMap, 'road', 'casing', 'road_motorway_casing')).toBe(true)
    expect(hasEntry(layerMap, 'road', 'labels', 'highway-name-minor')).toBe(true)
  })

  it('assigns rail and aeroway layers to transit', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    expect(hasEntry(layerMap, 'transit.rail', 'fill', 'road_major_rail')).toBe(true)
    expect(hasEntry(layerMap, 'transit.rail', 'fill', 'tunnel_transit_rail')).toBe(true)
    expect(hasEntry(layerMap, 'transit.rail', 'fill', 'aeroway_runway')).toBe(true)
    expect(hasEntry(layerMap, 'transit.rail', 'labels', 'airport')).toBe(true)
  })

  it('assigns boundary lines and place labels to administrative children', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    expect(hasEntry(layerMap, 'administrative.country', 'fill', 'boundary_2')).toBe(true)
    expect(hasEntry(layerMap, 'administrative.state', 'fill', 'boundary_3')).toBe(true)
    expect(hasEntry(layerMap, 'administrative.country', 'labels', 'label_country_1')).toBe(true)
    expect(hasEntry(layerMap, 'administrative.state', 'labels', 'label_state')).toBe(true)
    expect(hasEntry(layerMap, 'administrative.settlement', 'labels', 'label_city')).toBe(true)
  })

  it('assigns landcover, landuse and park layers to landscape children', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    expect(hasEntry(layerMap, 'landscape.landcover', 'fill', 'landcover_wood')).toBe(true)
    expect(hasEntry(layerMap, 'landscape.landcover', 'fill', 'landcover_ice')).toBe(true)
    expect(hasEntry(layerMap, 'landscape.landuse', 'fill', 'landuse_residential')).toBe(true)
    expect(hasEntry(layerMap, 'landscape.landuse', 'fill', 'landuse_track')).toBe(true)
    expect(hasEntry(layerMap, 'landscape.park', 'fill', 'park')).toBe(true)
    expect(hasEntry(layerMap, 'landscape.park', 'fill', 'park_outline')).toBe(true)
  })

  it('assigns background and poi layers', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    expect(hasEntry(layerMap, 'background', 'fill', 'background')).toBe(true)
    expect(hasEntry(layerMap, 'poi.amenity', 'labels', 'poi_r20')).toBe(true)
    expect(hasEntry(layerMap, 'poi.transport', 'labels', 'poi_transit')).toBe(true)
  })

  it('routes retail, historic and tourism ids to poi.shop and poi.landmark', () => {
    const style = {
      version: 8,
      sources: {},
      layers: [
        { id: 'shop_retail_area', type: 'symbol', paint: {} },
        { id: 'historic_monument_label', type: 'symbol', paint: {} },
        { id: 'tourism_attraction_label', type: 'symbol', paint: {} },
      ],
    } as unknown as StyleSpecification
    const layerMap = buildLayerMapFromStyle(style)

    expect(hasEntry(layerMap, 'poi.shop', 'labels', 'shop_retail_area')).toBe(true)
    expect(hasEntry(layerMap, 'poi', 'labels', 'shop_retail_area')).toBe(true)
    expect(hasEntry(layerMap, 'poi.landmark', 'labels', 'historic_monument_label')).toBe(true)
    expect(hasEntry(layerMap, 'poi.landmark', 'labels', 'tourism_attraction_label')).toBe(true)
    expect(hasEntry(layerMap, 'poi.amenity', 'labels', 'shop_retail_area')).toBe(false)
  })

  it('routes bus, ferry, cablecar and street-limit ids to their transit and road categories', () => {
    const style = {
      version: 8,
      sources: {},
      layers: [
        { id: 'bus_route_label', type: 'symbol', paint: {} },
        { id: 'ferry_line', type: 'line', paint: {} },
        { id: 'aerialway_cablecar', type: 'line', paint: {} },
        { id: 'road_street_limited', type: 'line', paint: {} },
        { id: 'tunnel_street_limits_casing', type: 'line', paint: {} },
      ],
    } as unknown as StyleSpecification
    const layerMap = buildLayerMapFromStyle(style)

    expect(hasEntry(layerMap, 'transit.bus', 'labels', 'bus_route_label')).toBe(true)
    expect(hasEntry(layerMap, 'transit', 'labels', 'bus_route_label')).toBe(true)
    expect(hasEntry(layerMap, 'transit.ferry', 'fill', 'ferry_line')).toBe(true)
    expect(hasEntry(layerMap, 'transit.aerialway', 'fill', 'aerialway_cablecar')).toBe(true)
    expect(hasEntry(layerMap, 'road.street-limits', 'fill', 'road_street_limited')).toBe(true)
    expect(hasEntry(layerMap, 'road.street-limits', 'casing', 'tunnel_street_limits_casing')).toBe(true)
    expect(hasEntry(layerMap, 'road', 'fill', 'road_street_limited')).toBe(true)
  })

  it('lands unmatched road-name symbols in road.others labels', () => {
    const style = {
      version: 8,
      sources: {},
      layers: [{ id: 'road_name_5', type: 'symbol', paint: {} }],
    } as unknown as StyleSpecification
    const layerMap = buildLayerMapFromStyle(style)

    expect(hasEntry(layerMap, 'road.others', 'labels', 'road_name_5')).toBe(true)
  })

  it('lands place-class other labels in administrative.settlement', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    expect(hasEntry(layerMap, 'administrative.settlement', 'labels', 'label_other')).toBe(true)
    expect(hasEntry(layerMap, 'administrative', 'labels', 'label_other')).toBe(true)
    expect(hasEntry(layerMap, 'road.others', 'labels', 'label_other')).toBe(false)
  })

  it('keeps genuinely unmatched categories empty on real liberty-style layer ids', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    for (const id of [
      'poi.shop',
      'poi.landmark',
      'road.street-limits',
      'transit.bus',
      'transit.ferry',
      'transit.aerialway',
    ]) {
      expect(layerMap[id]).toEqual({ fill: [], casing: [], labels: [] })
    }
  })

  it('keeps raster layers out of every category', () => {
    const layerMap = buildLayerMapFromStyle(FIXTURE_STYLE)
    expect(allLayerIds(layerMap)).not.toContain('natural_earth')
  })
})
