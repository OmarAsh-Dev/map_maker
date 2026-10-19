// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { MapOptions } from 'maplibre-gl'
import { createMapOptions } from './mapOptions'

const OPENFREEMAP_LIBERTY = 'https://tiles.openfreemap.org/styles/liberty'

type CreatedOptions = MapOptions & {
  preserveDrawingBuffer?: boolean
  canvasContextAttributes?: { preserveDrawingBuffer?: boolean }
}

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
})
