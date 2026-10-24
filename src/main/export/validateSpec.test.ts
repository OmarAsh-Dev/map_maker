import { describe, expect, it } from 'vitest'
import { validateExportSpec } from './validateSpec'

function validSpec(): Record<string, unknown> {
  return {
    mode: 'layered',
    container: 'psd',
    cols: 2,
    rows: 2,
    chunkPx: 2048,
    actualWidth: 4096,
    actualHeight: 4096,
    outWidth: 4096,
    outHeight: 4096,
    groups: [
      { id: 'water', label: 'Water' },
      { id: 'water', label: 'Water labels' },
    ],
    outPath: 'C:/out/map.psd',
    attribution: null,
  }
}

describe('validateExportSpec', () => {
  it('accepts a well-formed export spec', () => {
    expect(() => validateExportSpec(validSpec())).not.toThrow()
  })

  it('accepts the flat spec with attribution string and no groups', () => {
    const spec = { ...validSpec(), mode: 'flat', groups: [], attribution: '© OpenStreetMap contributors' }
    expect(() => validateExportSpec(spec)).not.toThrow()
  })

  it.each([
    ['non-object spec', null, /expected an object/],
    ['bad mode', { mode: 'both' }, /mode must be one of/],
    ['bad container', { container: 'zip' }, /container must be one of/],
    ['zero cols', { cols: 0 }, /cols must be a positive integer/],
    ['fractional rows', { rows: 1.5 }, /rows must be a positive integer/],
    ['NaN chunkPx', { chunkPx: Number.NaN }, /chunkPx must be a positive integer/],
    ['Infinity outWidth', { outWidth: Number.POSITIVE_INFINITY }, /outWidth must be a positive integer/],
    ['oversized cols', { cols: 32769 }, /cols must be at most 32768/],
    ['oversized outHeight', { outHeight: 32769 }, /outHeight must be at most 32768/],
    ['oversized chunkPx', { chunkPx: 32769 }, /chunkPx must be at most 32768/],
    ['groups not an array', { groups: 'water' }, /groups must be an array/],
    ['group member not an object', { groups: ['water'] }, /each group must be an object/],
    ['group id not a string', { groups: [{ id: 1, label: 'Water' }] }, /non-empty string id and label/],
    ['group label empty', { groups: [{ id: 'water', label: '' }] }, /non-empty string id and label/],
    ['relative outPath', { outPath: 'out/map.psd' }, /outPath must be an absolute path/],
    ['non-string outPath', { outPath: 42 }, /outPath must be an absolute path/],
    ['numeric attribution', { attribution: 1 }, /attribution must be a string or null/],
    ['missing attribution', { attribution: undefined }, /attribution must be a string or null/],
  ])('rejects %s', (_label, override, pattern) => {
    const spec = { ...validSpec(), ...(override as Record<string, unknown>) }
    if (override === null) {
      expect(() => validateExportSpec(null)).toThrow(pattern as RegExp)
      return
    }
    expect(() => validateExportSpec(spec)).toThrow(pattern as RegExp)
  })

  it('rejects cols*rows above 32768 even when each dimension is within range', () => {
    const spec = { ...validSpec(), cols: 256, rows: 129 }
    expect(() => validateExportSpec(spec)).toThrow(/cols\*rows must be at most 32768/)
  })

  it('accepts 32K dimensions (32768x32768) and cols*rows up to 32768', () => {
    const spec = { ...validSpec(), cols: 16, rows: 16, outWidth: 32768, outHeight: 32768 }
    expect(() => validateExportSpec(spec)).not.toThrow()
  })
})
