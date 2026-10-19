// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { dataUrlToArrayBuffer } from './pngDataUrl'

describe('dataUrlToArrayBuffer', () => {
  it('decodes a data url into the exact original bytes', () => {
    const original = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])
    const dataUrl = `data:image/png;base64,${btoa(String.fromCharCode(...original))}`
    const buffer = dataUrlToArrayBuffer(dataUrl)
    expect(buffer.byteLength).toBe(original.length)
    expect(Array.from(new Uint8Array(buffer))).toEqual(Array.from(original))
  })

  it('decodes a plain base64 string without a data-url prefix', () => {
    const buffer = dataUrlToArrayBuffer(btoa('map_maker'))
    expect(new TextDecoder().decode(buffer)).toBe('map_maker')
  })
})
