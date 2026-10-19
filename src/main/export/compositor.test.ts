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

async function markedPng(
  r: number,
  g: number,
  b: number,
  markerX: number,
  markerY: number,
  size = 64
): Promise<Buffer> {
  const marker = await solidPng(255, 255, 255, 4)
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r, g, b, alpha: 1 } },
  })
    .composite([{ input: marker, left: markerX, top: markerY }])
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

  it('crops the requested region from the grid top-left to exactly 100x100', async () => {
    const png = await compositeChunks(await gridChunks(), 2, 2, 64, 100, 100)

    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(100)
    expect(meta.height).toBe(100)

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

  it('composites a square 16k output past sharp default input pixel limit', async () => {
    const size = 16384
    const chunk = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 5, g: 6, b: 7, alpha: 1 } },
      limitInputPixels: false,
    })
      .png()
      .toBuffer()

    const png = await compositeChunks([{ col: 0, row: 0, png: chunk }], 1, 1, size, size, size)

    const meta = await sharp(png, { limitInputPixels: false }).metadata()
    expect(meta.width).toBe(size)
    expect(meta.height).toBe(size)
  }, 240_000)

  it('pastes partial edge chunks at their plan-space position and crops the region top-left', async () => {
    const chunks: CompositorChunk[] = [
      { col: 0, row: 0, png: await markedPng(255, 0, 0, 40, 40) },
      { col: 1, row: 0, png: await solidPng(0, 255, 0) },
      { col: 0, row: 1, png: await solidPng(0, 0, 255) },
      { col: 1, row: 1, png: await solidPng(255, 255, 0) },
    ]

    const png = await compositeChunks(chunks, 2, 2, 64, 96, 96)

    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(96)
    expect(meta.height).toBe(96)

    const [full, partialCol, partialRow, partialBoth, marker] = await sampleRgb(png, [
      [16, 16],
      [80, 16],
      [16, 80],
      [80, 80],
      [42, 42],
    ])
    expect(full).toEqual([255, 0, 0])
    expect(partialCol).toEqual([0, 255, 0])
    expect(partialRow).toEqual([0, 0, 255])
    expect(partialBoth).toEqual([255, 255, 0])
    expect(marker).toEqual([255, 255, 255])
  })

  it('clips a chunk canvas when the region is smaller than one chunk', async () => {
    const png = await compositeChunks(
      [{ col: 0, row: 0, png: await markedPng(200, 10, 10, 1030, 1030, 2048) }],
      1,
      1,
      2048,
      48,
      64
    )

    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(48)
    expect(meta.height).toBe(64)

    const [marker, base] = await sampleRgb(png, [
      [32, 40],
      [10, 10],
    ])
    expect(marker).toEqual([255, 255, 255])
    expect(base).toEqual([200, 10, 10])
  })

  it('rejects an output larger than the chunk grid', async () => {
    await expect(
      compositeChunks(await gridChunks(), 2, 2, 64, 200, 200)
    ).rejects.toThrow(/exceeds the .* chunk grid/i)
  })
})
