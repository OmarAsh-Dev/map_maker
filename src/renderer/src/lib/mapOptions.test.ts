// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapOptions } from 'maplibre-gl'

const { setMaxParallelImageRequests } = vi.hoisted(() => ({
  setMaxParallelImageRequests: vi.fn(),
}))

vi.mock('maplibre-gl', () => ({
  setMaxParallelImageRequests,
}))

import { applyRequestCaps, createMapOptions } from './mapOptions'

const OPENFREEMAP_LIBERTY = 'https://tiles.openfreemap.org/styles/liberty'

type CreatedOptions = MapOptions & {
  preserveDrawingBuffer?: boolean
  canvasContextAttributes?: { preserveDrawingBuffer?: boolean }
}

beforeEach(() => {
  setMaxParallelImageRequests.mockClear()
})

describe('createMapOptions', () => {
  it('returns openfreemap options with pitch locked and drawing buffer preserved', () => {
    const container = document.createElement('div')
    const options = createMapOptions(container, OPENFREEMAP_LIBERTY) as CreatedOptions

    expect(options.container).toBe(container)
    expect(options.style).toBe(OPENFREEMAP_LIBERTY)
    expect(options.pitch).toBe(0)
    expect(options.maxPitch).toBe(0)
    expect(options.preserveDrawingBuffer).toBe(true)
    expect(options.canvasContextAttributes?.preserveDrawingBuffer).toBe(true)
    expect(options.renderWorldCopies).toBe(false)
    expect(options.attributionControl).toBe(false)
  })

  it('caps parallel tile requests at 4 for OpenFreeMap etiquette', () => {
    const container = document.createElement('div')
    createMapOptions(container, OPENFREEMAP_LIBERTY)
    createMapOptions(container, OPENFREEMAP_LIBERTY)
    applyRequestCaps()

    expect(setMaxParallelImageRequests).toHaveBeenCalledWith(4)
    for (const call of setMaxParallelImageRequests.mock.calls) {
      expect(call[0]).toBe(4)
    }
  })
})
