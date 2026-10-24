import { readPsd } from 'ag-psd'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { assemblePsd, type PsdLayer } from './psd'

async function solidPng(r: number, g: number, b: number, size = 32): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r, g, b, alpha: 1 } },
  })
    .png()
    .toBuffer()
}

describe('assemblePsd', () => {
  it('writes bottom→top layers with children ordered top-first and preserves top-layer pixels', async () => {
    const layers: PsdLayer[] = [
      { name: 'Roads', png: await solidPng(0, 0, 255) },
      { name: 'Roads labels', png: await solidPng(255, 0, 0) },
    ]

    const buffer = await assemblePsd(layers, 32, 32)
    const psd = readPsd(buffer, { useImageData: true })

    expect(psd.width).toBe(32)
    expect(psd.height).toBe(32)
    expect(psd.children).toHaveLength(2)
    expect(psd.children![0].name).toBe('Roads labels')
    expect(psd.children![1].name).toBe('Roads')

    const top = psd.children![0].imageData!
    expect(top.width).toBe(32)
    const data = top.data as Uint8Array
    const i = (16 * 32 + 16) * 4
    expect(data[i]).toBeGreaterThan(data[i + 2])
    expect(data[i]).toBeGreaterThan(200)
    expect(data[i + 2]).toBeLessThan(50)
  })

  it('reverses three bottom→top layers into top-first children', async () => {
    const layers: PsdLayer[] = [
      { name: 'Base', png: await solidPng(200, 200, 200) },
      { name: 'Roads', png: await solidPng(0, 0, 255) },
      { name: 'Markers', png: await solidPng(255, 0, 0) },
    ]

    const buffer = await assemblePsd(layers, 32, 32)
    const psd = readPsd(buffer, { useImageData: true })

    expect(psd.children).toHaveLength(3)
    expect(psd.children![0].name).toBe('Markers')
    expect(psd.children![1].name).toBe('Roads')
    expect(psd.children![2].name).toBe('Base')
  })

  it('falls back to PSB when a dimension exceeds 30000', async () => {
    const layers: PsdLayer[] = [{ name: 'Huge', png: await solidPng(0, 0, 255) }]

    const buffer = await assemblePsd(layers, 30001, 32)

    expect(buffer.readUInt16BE(4)).toBe(2)
    const psd = readPsd(buffer, { useImageData: true })
    expect(psd.width).toBe(30001)
    expect(psd.height).toBe(32)
    expect(psd.children![0].name).toBe('Huge')
  })

  it('assembles a square 16k layer past sharp default input pixel limit', async () => {
    const size = 16384
    const png = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
      limitInputPixels: false,
    })
      .png()
      .toBuffer()

    const buffer = await assemblePsd([{ name: 'Square16k', png }], size, size)

    expect(buffer.readUInt16BE(4)).toBe(1)
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('8BPS')
    expect(buffer.readUInt32BE(18)).toBe(size)
    expect(buffer.readUInt32BE(14)).toBe(size)
  }, 240_000)
})
