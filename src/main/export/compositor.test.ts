import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { compositeChunks, type CompositorChunk } from './compositor'

async function solidPng(r: number, g: number, b: number, size = 64): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r, g, b, alpha: 1 } },
  })
    .png()
    .toBuffer()
}

async function sampleRgb(png: Buffer, points: Array<[number, number]>): Promise<Array<[number, number, number]>> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  return points.map(([x, y]) => {
    const i = (y * info.width + x) * info.channels
    return [data[i], data[i + 1], data[i + 2]] as [number, number, number]
  })
}

async function gridChunks(): Promise<CompositorChunk[]> {
  return [
    { col: 0, row: 0, png: await solidPng(255, 0, 0) },
    { col: 1, row: 0, png: await solidPng(0, 255, 0) },
    { col: 0, row: 1, png: await solidPng(0, 0, 255) },
    { col: 1, row: 1, png: await solidPng(255, 255, 0) },
  ]
}

describe('compositeChunks', () => {
  it('composites a 2x2 chunk grid into a 128x128 PNG with correct quadrant colors', async () => {
    const png = await compositeChunks(await gridChunks(), 2, 2, 64, 128, 128)

    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(128)
    expect(meta.height).toBe(128)
    expect(meta.format).toBe('png')

    const [tl, tr, bl, br] = await sampleRgb(png, [
      [32, 32],
      [96, 32],
      [32, 96],
      [96, 96],
    ])
    expect(tl).toEqual([255, 0, 0])
    expect(tr).toEqual([0, 255, 0])
    expect(bl).toEqual([0, 0, 255])
    expect(br).toEqual([255, 255, 0])
  })

  it('center-crops to exactly 100x100 when the output is smaller than the grid', async () => {
    const png = await compositeChunks(await gridChunks(), 2, 2, 64, 100, 100)

    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(100)
    expect(meta.height).toBe(100)

    // crop offset is (14, 14): quadrant centers land at 45/55 in cropped coords
    const [tl, tr, bl, br] = await sampleRgb(png, [
      [45, 45],
      [55, 45],
      [45, 55],
      [55, 55],
    ])
    expect(tl).toEqual([255, 0, 0])
    expect(tr).toEqual([0, 255, 0])
    expect(bl).toEqual([0, 0, 255])
    expect(br).toEqual([255, 255, 0])
  })
})
