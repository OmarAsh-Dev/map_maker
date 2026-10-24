import { beforeEach, describe, expect, it } from 'vitest'
import { adjustBoundsToRatio } from '../lib/chunkPlan'
import type { CropBounds } from '../lib/chunkPlan'
import { effectiveLongEdge, SIZE_PRESETS, useExportStore } from './exportStore'

const SQUARE: CropBounds = { west: -0.05, south: 51.49, east: 0.05, north: 51.55 }

describe('exportStore crop bounds and aspect lock', () => {
  beforeEach(() => {
    useExportStore.setState({
      aspectRatio: 'free',
      cropBounds: null,
      cropMode: false,
      dialogOpen: false,
    })
  })

  it('stores free-ratio crop bounds as dragged', () => {
    useExportStore.getState().setCropBounds(SQUARE)
    expect(useExportStore.getState().cropBounds).toEqual(SQUARE)
  })

  it('re-applies a locked aspect ratio when a new crop is dragged', () => {
    useExportStore.getState().setAspectRatio('16:9')
    useExportStore.getState().setCropBounds(SQUARE)
    expect(useExportStore.getState().cropBounds).toEqual(
      adjustBoundsToRatio(SQUARE, 16 / 9)
    )
  })

  it('leaves null bounds alone while a ratio is locked', () => {
    useExportStore.getState().setAspectRatio('1:1')
    useExportStore.getState().setCropBounds(null)
    expect(useExportStore.getState().cropBounds).toBeNull()
  })

  it('includes a 32K size preset at 32768 px and clamps custom sizes to 32768', () => {
    expect(SIZE_PRESETS.find((p) => p.id === '32K')).toEqual({
      id: '32K',
      label: '32K',
      longEdge: 32768,
    })
    expect(effectiveLongEdge({ sizePreset: '32K', customLongEdge: 3840 })).toBe(32768)
    useExportStore.getState().setCustomLongEdge(50000)
    expect(useExportStore.getState().customLongEdge).toBe(32768)
  })
})
