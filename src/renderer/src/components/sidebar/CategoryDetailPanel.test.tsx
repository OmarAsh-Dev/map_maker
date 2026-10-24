// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { StyleSpecification } from 'maplibre-gl'
import CategoryDetailPanel from './CategoryDetailPanel'
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
  water: { fill: ['water-fill'], casing: ['water-casing'], labels: ['water-label'] },
  landscape: { fill: ['landuse-fill'], casing: [], labels: [] },
  road: { fill: ['road-a', 'road-b'], casing: [], labels: ['road-label'] },
  'road.highway': { fill: ['road-a'], casing: [], labels: ['road-label'] },
}

const FIXTURE_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'water-fill', type: 'fill', paint: { 'fill-color': '#1191bd', 'fill-opacity': 1 } },
    { id: 'water-casing', type: 'line', paint: { 'line-color': '#0f6d90', 'line-opacity': 1 } },
    {
      id: 'water-label',
      type: 'symbol',
      paint: { 'text-color': '#22506b', 'text-halo-color': '#ffffff', 'text-opacity': 1 },
    },
    { id: 'road-a', type: 'fill', paint: { 'fill-color': '#111111', 'fill-opacity': 1 } },
    { id: 'road-b', type: 'fill', paint: { 'fill-color': '#222222', 'fill-opacity': 1 } },
    {
      id: 'road-label',
      type: 'symbol',
      paint: { 'text-color': '#333333', 'icon-opacity': 1 },
    },
    {
      id: 'landuse-fill',
      type: 'fill',
      paint: {
        'fill-color': ['interpolate', ['linear'], ['zoom'], 9, 'hsla(0,3%,85%,0.84)', 12, 'hsla(35,57%,88%,0.9)'],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 12.5, 1],
      },
    },
  ],
} as unknown as StyleSpecification

function paintOf(style: StyleSpecification, layerId: string, prop: string): unknown {
  const layer = style.layers.find((entry) => entry.id === layerId) as unknown as
    | { paint?: Record<string, unknown> }
    | undefined
  return layer?.paint?.[prop]
}

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

it('renders nothing when no category is selected', () => {
  render(<CategoryDetailPanel />)
  expect(screen.queryByTestId('category-detail-panel')).not.toBeInTheDocument()
})

it('shows the three section headings for a selected category', () => {
  useMapStore.getState().selectCategory('water')
  render(<CategoryDetailPanel />)
  expect(screen.getByRole('heading', { name: 'Water' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Geometry' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Label text' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Label icon' })).toBeInTheDocument()
})

it('changing the geometry fill input patches geometryFill in the store', () => {
  useMapStore.getState().selectCategory('water')
  render(<CategoryDetailPanel />)
  fireEvent.change(screen.getByLabelText('Geometry fill'), { target: { value: '#abcdef' } })
  const state = useMapStore.getState()
  expect(paintOf(state.style as StyleSpecification, 'water-fill', 'fill-color')).toBe('#abcdef')
})

it('setting the geometry opacity slider to 70 patches geometryOpacity 0.7', () => {
  useMapStore.getState().selectCategory('water')
  render(<CategoryDetailPanel />)
  fireEvent.change(screen.getByLabelText('Geometry opacity'), { target: { value: '70' } })
  const state = useMapStore.getState()
  expect(paintOf(state.style as StyleSpecification, 'water-fill', 'fill-opacity')).toBe(0.7)
  expect(paintOf(state.style as StyleSpecification, 'water-casing', 'line-opacity')).toBe(0.7)
})

it('renders Mixed for a field whose group sub-items disagree and overriding dispatches a patch', () => {
  useMapStore.getState().selectCategory('road')
  render(<CategoryDetailPanel />)
  const field = screen.getByTestId('field-geometry-fill')
  expect(within(field).getByText('Mixed')).toBeInTheDocument()
  expect(within(field).getByLabelText('Geometry fill')).toHaveValue('#ffffff')
  fireEvent.change(within(field).getByLabelText('Geometry fill'), { target: { value: '#abcdef' } })
  const state = useMapStore.getState()
  expect(paintOf(state.style as StyleSpecification, 'road-a', 'fill-color')).toBe('#abcdef')
  expect(paintOf(state.style as StyleSpecification, 'road-b', 'fill-color')).toBe('#abcdef')
})

it('renders Mixed instead of NaN for expression-based opacity and still dispatches on change', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  useMapStore.getState().selectCategory('landscape')
  render(<CategoryDetailPanel />)
  const field = screen.getByTestId('field-geometry-opacity')
  expect(within(field).getByText('Mixed')).toBeInTheDocument()
  expect(within(field).getByLabelText('Geometry opacity')).toHaveValue('100')
  fireEvent.change(within(field).getByLabelText('Geometry opacity'), { target: { value: '70' } })
  const state = useMapStore.getState()
  expect(paintOf(state.style as StyleSpecification, 'landuse-fill', 'fill-opacity')).toBe(0.7)
  const nanWarning = consoleError.mock.calls.find((args) => String(args[0]).includes('NaN'))
  expect(nanWarning).toBeUndefined()
  consoleError.mockRestore()
})

it('clicking the geometry eye patches geometryVisible false and back to true', () => {
  useMapStore.getState().selectCategory('water')
  render(<CategoryDetailPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Geometry visibility' }))
  let state = useMapStore.getState()
  expect(layoutVisibilityOf(state.style as StyleSpecification, 'water-fill')).toBe('none')
  expect(layoutVisibilityOf(state.style as StyleSpecification, 'water-casing')).toBe('none')
  expect(layoutVisibilityOf(state.style as StyleSpecification, 'water-label')).not.toBe('none')

  fireEvent.click(screen.getByRole('button', { name: 'Toggle Geometry visibility' }))
  state = useMapStore.getState()
  expect(layoutVisibilityOf(state.style as StyleSpecification, 'water-fill')).toBe('visible')
  expect(layoutVisibilityOf(state.style as StyleSpecification, 'water-casing')).toBe('visible')
})

it('clicking the label text eye patches labelVisible without touching geometry', () => {
  useMapStore.getState().selectCategory('water')
  render(<CategoryDetailPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Label text visibility' }))
  const state = useMapStore.getState()
  expect(layoutVisibilityOf(state.style as StyleSpecification, 'water-label')).toBe('none')
  expect(layoutVisibilityOf(state.style as StyleSpecification, 'water-fill')).not.toBe('none')
})

it('label icon eye and color input patch label icon fields', () => {
  useMapStore.getState().selectCategory('water')
  render(<CategoryDetailPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Label icon visibility' }))
  let state = useMapStore.getState()
  expect(paintOf(state.style as StyleSpecification, 'water-label', 'icon-opacity')).toBe(0)

  fireEvent.change(screen.getByLabelText('Label icon color'), { target: { value: '#123456' } })
  state = useMapStore.getState()
  expect(paintOf(state.style as StyleSpecification, 'water-label', 'icon-color')).toBe('#123456')
})

it('label icon eye reflects the newly selected category style instead of stale local state', () => {
  useMapStore.getState().selectCategory('water')
  render(<CategoryDetailPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Label icon visibility' }))
  let state = useMapStore.getState()
  expect(paintOf(state.style as StyleSpecification, 'water-label', 'icon-opacity')).toBe(0)
  expect(screen.getByRole('button', { name: 'Toggle Label icon visibility' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )

  act(() => {
    useMapStore.getState().selectCategory('road.highway')
  })
  const eye = screen.getByRole('button', { name: 'Toggle Label icon visibility' })
  expect(eye).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(eye)
  state = useMapStore.getState()
  expect(paintOf(state.style as StyleSpecification, 'road-label', 'icon-opacity')).toBe(0)
})

it('displays resolved hex color in the picker for hsl and zoom-interpolated colors', () => {
  useMapStore.getState().selectCategory('landscape')
  render(<CategoryDetailPanel />)
  const field = screen.getByTestId('field-geometry-fill')
  expect(within(field).queryByText('Mixed')).not.toBeInTheDocument()
  expect(within(field).getByLabelText('Geometry fill')).toHaveValue('#dad8d8')
})
