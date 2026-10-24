// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { StyleSpecification } from 'maplibre-gl'
import FeatureTree from './FeatureTree'
import type { LayerMap } from '../../lib/styleMap'
import { useMapStore } from '../../stores/mapStore'

vi.mock('maplibre-gl', () => ({
  Map: class {
    on() {
      return this
    }
    remove() {}
  },
  setWorkerUrl: () => {},
}))

const FIXTURE_LAYER_MAP: LayerMap = {
  water: { fill: ['water-fill'], casing: [], labels: ['water-label'] },
  buildings: { fill: ['building-fill'], casing: [], labels: [] },
  road: { fill: ['road-motorway'], casing: [], labels: ['road-name'] },
  'road.highway': { fill: ['road-motorway'], casing: [], labels: ['road-name'] },
}

const FIXTURE_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'water-fill', type: 'fill', paint: { 'fill-color': '#1191bd' } },
    { id: 'water-label', type: 'symbol', paint: { 'text-color': '#22506b' } },
    { id: 'building-fill', type: 'fill', paint: { 'fill-color': '#d4d0c8' } },
    { id: 'road-motorway', type: 'line', paint: { 'line-color': '#e892a2' } },
    { id: 'road-name', type: 'symbol', paint: { 'text-color': '#333333' } },
  ],
} as unknown as StyleSpecification

const GROUP_LABELS = [
  'Administrative',
  'Landscape',
  'Buildings',
  'Points of interest',
  'Road',
  'Transit',
  'Water',
  'Background',
]

function layoutVisibilityOf(style: StyleSpecification, layerId: string): string | undefined {
  const layer = style.layers.find((entry) => entry.id === layerId) as unknown as
    | { layout?: Record<string, unknown> }
    | undefined
  return layer?.layout?.visibility as string | undefined
}

beforeEach(() => {
  useMapStore.setState({ style: FIXTURE_STYLE, layerMap: FIXTURE_LAYER_MAP, selectedCategoryId: null })
})

afterEach(() => {
  cleanup()
  useMapStore.setState({ style: null, layerMap: {}, selectedCategoryId: null })
})

it('renders all 8 group labels', () => {
  render(<FeatureTree />)
  for (const label of GROUP_LABELS) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
})

it('shows the category geometry fill color as the row swatch', () => {
  const { container } = render(<FeatureTree />)
  const swatch = container.querySelector('[data-testid="swatch-water"]')
  expect(swatch).toHaveStyle({ backgroundColor: 'rgb(17, 145, 189)' })
})

it('toggles expanded children when a group row is clicked', () => {
  render(<FeatureTree />)
  expect(screen.queryByText('Highway')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Road'))
  expect(screen.getByText('Highway')).toBeInTheDocument()
  expect(useMapStore.getState().selectedCategoryId).toBe('road')
  fireEvent.click(screen.getByText('Road'))
  expect(screen.queryByText('Highway')).not.toBeInTheDocument()
})

it('eye button patches category visibility with the toggled value', () => {
  render(<FeatureTree />)
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Water visibility' }))
  const state = useMapStore.getState()
  expect(layoutVisibilityOf(state.style as StyleSpecification, 'water-fill')).toBe('none')
  expect(layoutVisibilityOf(state.style as StyleSpecification, 'water-label')).toBe('none')

  fireEvent.click(screen.getByRole('button', { name: 'Toggle Water visibility' }))
  const next = useMapStore.getState()
  expect(layoutVisibilityOf(next.style as StyleSpecification, 'water-fill')).toBe('visible')
  expect(layoutVisibilityOf(next.style as StyleSpecification, 'water-label')).toBe('visible')
})

it('eye button does not select the row', () => {
  render(<FeatureTree />)
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Water visibility' }))
  expect(useMapStore.getState().selectedCategoryId).toBeNull()
})

it('clicking a row selects its category', () => {
  render(<FeatureTree />)
  fireEvent.click(screen.getByText('Buildings'))
  expect(useMapStore.getState().selectedCategoryId).toBe('buildings')
  fireEvent.click(screen.getByText('Points of interest'))
  expect(useMapStore.getState().selectedCategoryId).toBe('poi')
})

it('renders a resolved hex swatch when a category layer uses zoom-interpolated hsl() syntax', () => {
  const hslStyle = {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'water-fill',
        type: 'fill',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            'hsl(210, 50%, 40%)',
            12,
            'hsl(210, 50%, 40%)',
          ],
        },
      },
    ],
  } as unknown as StyleSpecification
  useMapStore.setState({
    style: hslStyle,
    layerMap: { water: { fill: ['water-fill'], casing: [], labels: [] } },
  })
  const { container } = render(<FeatureTree />)
  const swatch = container.querySelector('[data-testid="swatch-water"]')
  expect(swatch).toHaveStyle({ backgroundColor: 'rgb(51, 102, 153)' })
})
