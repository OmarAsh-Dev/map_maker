export interface CropBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface Chunk {
  col: number
  row: number
  centerX: number
  centerY: number
  lng: number
  lat: number
}

export interface ChunkPlan {
  zoom: number
  chunkPx: number
  actualWidth: number
  actualHeight: number
  cols: number
  rows: number
  chunks: Chunk[]
}

export const MAX_EXPORT_PX = 16384

const TILE_PX = 512
const MAX_LAT = 85.051129
const SPAN_FLOOR = 1e-9

function mercatorFraction(lat: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
  const phi = (clamped * Math.PI) / 180
  const fraction = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2
  return Math.min(1, Math.max(0, fraction))
}

function normalizeSpan(raw: number): number {
  return Math.min(1, Math.max(SPAN_FLOOR, raw))
}

export function lngLatToWorldPx(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const worldPx = TILE_PX * Math.pow(2, zoom)
  return { x: (worldPx * (lng + 180)) / 360, y: worldPx * mercatorFraction(lat) }
}

export function worldPxToLngLat(x: number, y: number, zoom: number): { lng: number; lat: number } {
  const worldPx = TILE_PX * Math.pow(2, zoom)
  const lng = (x / worldPx) * 360 - 180
  const fraction = y / worldPx
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * fraction))) * 180) / Math.PI
  return { lng, lat }
}

export function planChunks(bounds: CropBounds, longEdgePx: number, chunkPx: number = 2048): ChunkPlan {
  const edge = Math.min(Math.max(longEdgePx, 1), MAX_EXPORT_PX)
  const tile = Math.max(1, chunkPx)
  const spanX = normalizeSpan((bounds.east - bounds.west) / 360)
  const spanY = normalizeSpan(mercatorFraction(bounds.south) - mercatorFraction(bounds.north))
  const worldPx = edge / Math.max(spanX, spanY)
  const zoom = Math.log2(worldPx / TILE_PX)
  const actualWidth = Math.round(worldPx * spanX)
  const actualHeight = Math.round(worldPx * spanY)
  const originX = (worldPx * (bounds.west + 180)) / 360
  const originY = worldPx * mercatorFraction(bounds.north)
  const cols = Math.ceil(actualWidth / tile)
  const rows = Math.ceil(actualHeight / tile)
  const chunks: Chunk[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const centerX = col * tile + Math.min(tile, actualWidth - col * tile) / 2
      const centerY = row * tile + Math.min(tile, actualHeight - row * tile) / 2
      const { lng, lat } = worldPxToLngLat(originX + centerX, originY + centerY, zoom)
      chunks.push({ col, row, centerX, centerY, lng, lat })
    }
  }
  return { zoom, chunkPx: tile, actualWidth, actualHeight, cols, rows, chunks }
}
