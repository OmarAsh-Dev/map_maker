export interface CategoryDef {
  id: string
  label: string
}

export interface CategoryGroupDef {
  id: string
  label: string
  children: CategoryDef[]
}

export const CATEGORY_GROUPS: CategoryGroupDef[] = [
  {
    id: 'administrative',
    label: 'Administrative',
    children: [
      { id: 'administrative.country', label: 'Country' },
      { id: 'administrative.state', label: 'State' },
      { id: 'administrative.settlement', label: 'Settlement' },
    ],
  },
  {
    id: 'landscape',
    label: 'Landscape',
    children: [
      { id: 'landscape.landcover', label: 'Landcover' },
      { id: 'landscape.landuse', label: 'Landuse' },
      { id: 'landscape.park', label: 'Park' },
    ],
  },
  { id: 'buildings', label: 'Buildings', children: [] },
  {
    id: 'poi',
    label: 'Points of interest',
    children: [
      { id: 'poi.transport', label: 'Transport' },
      { id: 'poi.amenity', label: 'Amenity' },
      { id: 'poi.shop', label: 'Shop' },
      { id: 'poi.landmark', label: 'Landmark' },
    ],
  },
  {
    id: 'road',
    label: 'Road',
    children: [
      { id: 'road.highway', label: 'Highway' },
      { id: 'road.arterial', label: 'Arterial' },
      { id: 'road.minor', label: 'Minor' },
      { id: 'road.service', label: 'Service' },
      { id: 'road.street-limits', label: 'Street limits' },
      { id: 'road.path', label: 'Path' },
      { id: 'road.others', label: 'Others' },
    ],
  },
  {
    id: 'transit',
    label: 'Transit',
    children: [
      { id: 'transit.rail', label: 'Rail' },
      { id: 'transit.bus', label: 'Bus' },
      { id: 'transit.ferry', label: 'Ferry' },
      { id: 'transit.aerialway', label: 'Aerialway' },
    ],
  },
  { id: 'water', label: 'Water', children: [] },
  { id: 'background', label: 'Background', children: [] },
]
