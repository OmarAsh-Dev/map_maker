import { describe, expect, it } from 'vitest'
import { MAX_EXPORT_PX, lngLatToWorldPx, planChunks, worldPxToLngLat } from './chunkPlan'
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
