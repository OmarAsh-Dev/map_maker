import { describe, expect, it } from 'vitest'
import {
  MAX_EXPORT_PX,
  adjustBoundsToRatio,
  lngLatToWorldPx,
  mercatorFraction,
  planChunks,
  worldPxToLngLat,
} from './chunkPlan'
import type { CropBounds } from './chunkPlan'

const FULL_WORLD: CropBounds = { west: -180, east: 180, south: -85.051129, north: 85.051129 }

describe('MAX_EXPORT_PX', () => {
  it('caps exports at 16384 px', () => {
    expect(MAX_EXPORT_PX).toBe(16384)
  })
})

describe('planChunks', () => {
  it('plans a 4x4 grid for the full world at 4096 px with 1024 px chunks', () => {
    const plan = planChunks(FULL_WORLD, 4096, 1024)
    expect(plan.zoom).toBe(3)
    expect(plan.chunkPx).toBe(1024)
    expect(plan.actualWidth).toBe(4096)
    expect(plan.cols).toBe(4)
    expect(plan.rows).toBe(4)
    expect(plan.chunks.length).toBe(16)
  })

  it('places the first chunk at world px (512, 512) with lng -135 and round-trips it', () => {
    const plan = planChunks(FULL_WORLD, 4096, 1024)
    const first = plan.chunks[0]
    expect(first.col).toBe(0)
    expect(first.row).toBe(0)
    expect(first.centerX).toBe(512)
    expect(first.centerY).toBe(512)
    expect(first.lng).toBe(-135)
    const back = lngLatToWorldPx(first.lng, first.lat, plan.zoom)
    expect(Math.abs(back.x - 512)).toBeLessThanOrEqual(1e-6)
    expect(Math.abs(back.y - 512)).toBeLessThanOrEqual(1e-6)
  })

  it('plans an 8x8 grid for the full world at 16384 px with 2048 px chunks', () => {
    const plan = planChunks(FULL_WORLD, 16384, 2048)
    expect(plan.zoom).toBe(5)
    expect(plan.cols).toBe(8)
    expect(plan.rows).toBe(8)
    expect(plan.chunks.length).toBe(64)
    const last = plan.chunks[plan.chunks.length - 1]
    expect(last.centerX).toBe(15360)
    expect(last.centerY).toBe(15360)
    expect(last.centerX).toBeLessThan(16384)
    expect(last.centerY).toBeLessThan(16384)
  })

  // Controller ruling: the brief's original square-region fixture (±66.51326 lat) was
  // arithmetically wrong (spanX=spanY=0.5 → actualHeight 4096); the formula is authoritative.
  // This corrected 2:1 crop (spanX=0.5, spanY=0.25) preserves the fixture's purpose:
  // verifying the short-edge computation.
  it('scales a 2:1 crop to a 4096x2048 output at the requested long edge', () => {
    const plan = planChunks({ west: -90, east: 90, south: -40.9767, north: 40.9767 }, 4096)
    expect(plan.zoom).toBe(4)
    expect(plan.actualWidth).toBe(4096)
    expect(plan.actualHeight).toBe(2048)
  })

  it('offsets regional chunk centers by the region origin in world px', () => {
    const bounds: CropBounds = { west: -90, east: 90, south: -40.9767, north: 40.9767 }
    const plan = planChunks(bounds, 4096, 1024)
    expect(plan.zoom).toBe(4)
    expect(plan.actualWidth).toBe(4096)
    expect(plan.actualHeight).toBe(2048)
    const first = plan.chunks[0]
    expect(first.col).toBe(0)
    expect(first.row).toBe(0)
    expect(first.centerX).toBe(512)
    expect(first.centerY).toBe(512)
    expect(first.lng).toBe(-67.5)
    expect(first.lat).toBeGreaterThan(-40.9767)
    expect(first.lat).toBeLessThan(40.9767)
    const last = plan.chunks[plan.chunks.length - 1]
    expect(last.col).toBe(3)
    expect(last.row).toBe(1)
    expect(last.lng).toBe(67.5)
    expect(last.lat).toBeGreaterThan(-40.9767)
    expect(last.lat).toBeLessThan(40.9767)
    expect(last.lng).toBeGreaterThan(first.lng)
  })

  it('keeps every chunk of a regional plan strictly inside the crop bounds', () => {
    for (const chunkPx of [1024, 2048]) {
      const plan = planChunks({ west: -90, east: 90, south: -40.9767, north: 40.9767 }, 4096, chunkPx)
      expect(plan.chunks.length).toBeGreaterThan(0)
      for (const chunk of plan.chunks) {
        expect(chunk.lng).toBeGreaterThan(-90)
        expect(chunk.lng).toBeLessThan(90)
        expect(chunk.lat).toBeGreaterThan(-40.9767)
        expect(chunk.lat).toBeLessThan(40.9767)
      }
    }
  })

  it('clamps longEdgePx above MAX_EXPORT_PX', () => {
    const plan = planChunks(FULL_WORLD, 99999)
    expect(Math.max(plan.actualWidth, plan.actualHeight)).toBe(16384)
    const regional = planChunks({ west: -10, east: 10, south: -10, north: 10 }, 99999)
    expect(Math.max(regional.actualWidth, regional.actualHeight)).toBeLessThanOrEqual(16384)
  })

  it('clamps latitudes beyond the mercator limit instead of producing NaN', () => {
    const plan = planChunks({ west: -10, east: 10, south: -89.9, north: 89.9 }, 4096)
    expect(plan.actualHeight).toBe(4096)
    expect(Number.isFinite(plan.zoom)).toBe(true)
    expect(Number.isFinite(plan.actualWidth)).toBe(true)
    for (const chunk of plan.chunks) {
      expect(Number.isFinite(chunk.lng)).toBe(true)
      expect(Number.isFinite(chunk.lat)).toBe(true)
    }
    const px = lngLatToWorldPx(0, 89.9, 5)
    expect(Number.isFinite(px.y)).toBe(true)
    const inv = worldPxToLngLat(0, -1, 5)
    expect(Number.isFinite(inv.lat)).toBe(true)
  })

  it('floors degenerate east===west spans to avoid division by zero', () => {
    const plan = planChunks({ west: 10, east: 10, south: -20, north: 20 }, 4096)
    expect(plan.actualWidth).toBe(0)
    expect(plan.chunks.length).toBe(0)
    expect(Number.isFinite(plan.zoom)).toBe(true)
    expect(Number.isFinite(plan.actualHeight)).toBe(true)
  })

  it('pulls partial edge chunk centers inward to the middle of the partial strip', () => {
    const zoom = Math.log2(960 / 512)
    const south = worldPxToLngLat(0, 960 * 0.55, zoom).lat
    const north = worldPxToLngLat(0, 960 * 0.45, zoom).lat
    const plan = planChunks({ west: 0, east: 36, south, north }, 96, 64)

    expect(plan.actualWidth).toBe(96)
    expect(plan.actualHeight).toBe(96)
    expect(plan.cols).toBe(2)
    expect(plan.rows).toBe(2)
    expect(plan.chunks[1].col).toBe(1)
    expect(plan.chunks[1].row).toBe(0)
    expect(plan.chunks[1].centerX).toBe(64 + Math.min(64, 96 - 64) / 2)
    expect(plan.chunks[1].centerX).toBe(80)
    expect(plan.chunks[1].centerY).toBe(32)
    expect(plan.chunks[2].centerY).toBe(80)
    expect(plan.chunks[3].centerX).toBe(80)
  })
})

describe('coordinate conversion', () => {
  it('round-trips lng/lat through world px within 1e-9', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 4],
      [33.5, -22.7, 7],
      [-135, 79.17133464081945, 3],
      [120.2, -66.51326, 5]
    ]
    for (const [lng, lat, zoom] of cases) {
      const px = lngLatToWorldPx(lng, lat, zoom)
      const inv = worldPxToLngLat(px.x, px.y, zoom)
      expect(inv.lng).toBeCloseTo(lng, 9)
      expect(inv.lat).toBeCloseTo(lat, 9)
    }
  })

  it('maps lng 0 lat 0 to the world center', () => {
    const px = lngLatToWorldPx(0, 0, 3)
    expect(px.x).toBe(2048)
    expect(px.y).toBe(2048)
  })
})

describe('adjustBoundsToRatio', () => {
  function squareMercatorBounds(): CropBounds {
    return {
      west: -18,
      east: 18,
      south: worldPxToLngLat(0, 512 * 0.55, 0).lat,
      north: worldPxToLngLat(0, 512 * 0.45, 0).lat,
    }
  }

  it('expands the lng span to reach 16:9 on a square bounds and preserves the center', () => {
    const bounds = squareMercatorBounds()
    expect(mercatorFraction(bounds.south) - mercatorFraction(bounds.north)).toBeCloseTo(0.1, 9)

    const adjusted = adjustBoundsToRatio(bounds, 16 / 9)

    expect((adjusted.east - adjusted.west) / 360).toBeCloseTo(0.1 * (16 / 9), 9)
    expect(mercatorFraction(adjusted.south) - mercatorFraction(adjusted.north)).toBeCloseTo(0.1, 9)
    expect(mercatorFraction(adjusted.south) - mercatorFraction(adjusted.north)).toBeCloseTo(
      ((adjusted.east - adjusted.west) / 360) * (9 / 16),
      6
    )
    expect((adjusted.east + adjusted.west) / 2).toBeCloseTo((bounds.east + bounds.west) / 2, 9)
    expect((mercatorFraction(adjusted.south) + mercatorFraction(adjusted.north)) / 2).toBeCloseTo(
      (mercatorFraction(bounds.south) + mercatorFraction(bounds.north)) / 2,
      6
    )
  })

  it('expands the mercator span to reach 9:16 on a square bounds and preserves the center', () => {
    const bounds = squareMercatorBounds()

    const adjusted = adjustBoundsToRatio(bounds, 9 / 16)

    expect(adjusted.west).toBeCloseTo(bounds.west, 9)
    expect(adjusted.east).toBeCloseTo(bounds.east, 9)
    expect(mercatorFraction(adjusted.south) - mercatorFraction(adjusted.north)).toBeCloseTo(
      0.1 * (16 / 9),
      9
    )
    expect((mercatorFraction(adjusted.south) + mercatorFraction(adjusted.north)) / 2).toBeCloseTo(
      0.5,
      6
    )
  })

  it('keeps square bounds effectively unchanged for 1:1', () => {
    const bounds = squareMercatorBounds()

    const adjusted = adjustBoundsToRatio(bounds, 1)

    expect((adjusted.east - adjusted.west) / 360).toBeCloseTo((bounds.east - bounds.west) / 360, 9)
    expect(mercatorFraction(adjusted.south) - mercatorFraction(adjusted.north)).toBeCloseTo(
      mercatorFraction(bounds.south) - mercatorFraction(bounds.north),
      9
    )
    expect((adjusted.east + adjusted.west) / 2).toBeCloseTo(0, 9)
  })

  it('clamps expansion that would leave the world instead of drifting the bounds', () => {
    const edge: CropBounds = { west: -180, east: -144, south: -10, north: 10 }

    const adjusted = adjustBoundsToRatio(edge, 16 / 9)

    expect(adjusted.west).toBeGreaterThanOrEqual(-180)
    expect(adjusted.east).toBeLessThanOrEqual(180)
  })
})
