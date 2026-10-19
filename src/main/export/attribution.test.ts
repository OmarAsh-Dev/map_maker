import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { renderAttributionPng } from './attribution'

describe('renderAttributionPng', () => {
  it('renders readable text bottom-right on a fully transparent canvas', async () => {
    const png = await renderAttributionPng(800, 600, '© OpenStreetMap contributors')
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(info.width).toBe(800)
    expect(info.height).toBe(600)
    expect(info.channels).toBe(4)

    const alphaAt = (x: number, y: number): number => data[(y * info.width + x) * 4 + 3]

    let bottomRightLit = 0
    for (let y = 560; y < 596; y++) {
      for (let x = 600; x < 796; x++) {
        if (alphaAt(x, y) > 0) bottomRightLit++
      }
    }
    expect(bottomRightLit).toBeGreaterThan(50)

    let topLeftLit = 0
    for (let y = 0; y < 300; y++) {
      for (let x = 0; x < 400; x++) {
        if (alphaAt(x, y) > 0) topLeftLit++
      }
    }
    expect(topLeftLit).toBe(0)

    let topRightLit = 0
    for (let y = 0; y < 300; y++) {
      for (let x = 400; x < 800; x++) {
        if (alphaAt(x, y) > 0) topRightLit++
      }
    }
    expect(topRightLit).toBe(0)
  })

  it('scales the text with the target width', async () => {
    const small = await renderAttributionPng(800, 600, '© OpenStreetMap contributors')
    const large = await renderAttributionPng(3840, 2160, '© OpenStreetMap contributors')

    const lit = async (png: Buffer): Promise<number> => {
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      let count = 0
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) count++
      }
      expect(info.width).toBeGreaterThan(0)
      return count
    }

    const smallLit = await lit(small)
    const largeLit = await lit(large)
    expect(largeLit).toBeGreaterThan(smallLit * 4)
  })
})
