// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { StyleSpecification } from 'maplibre-gl'
import PresetsBar from './PresetsBar'
import { buildLayerMapFromStyle } from '../lib/layerMapBuilder'
import { DEFAULT_STYLE_URL, useMapStore } from '../stores/mapStore'

const api = {
  savePreset: vi.fn(async (_name: string, _styleJson: string) => {}),
  listPresets: vi.fn(async () => [] as { name: string; mtime: number }[]),
  loadPreset: vi.fn(async (_name: string) => null as string | null),
  deletePreset: vi.fn(async (_name: string) => {}),
}

const STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'water-fill', type: 'fill', paint: { 'fill-color': '#1191bd' } }],
} as unknown as StyleSpecification

const PRESET_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'building-fill', type: 'fill', paint: { 'fill-color': '#d4d0c8' } }],
} as unknown as StyleSpecification

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = api
  vi.clearAllMocks()
  useMapStore.setState({
    style: STYLE,
    layerMap: {},
    basemapUrl: DEFAULT_STYLE_URL,
    selectedCategoryId: null,
  })
})

afterEach(() => {
  cleanup()
})

describe('PresetsBar', () => {
  it('saves the current style json via savePreset', async () => {
    const user = userEvent.setup()
    render(<PresetsBar />)

    await user.type(screen.getByLabelText('Preset name'), 'my-preset')
    await user.click(screen.getByRole('button', { name: 'Save preset' }))

    await waitFor(() =>
      expect(api.savePreset).toHaveBeenCalledWith('my-preset', JSON.stringify(STYLE))
    )
  })

  it('loads a preset into the map store with a fresh layer map', async () => {
    api.listPresets.mockResolvedValue([{ name: 'saved', mtime: 1 }])
    api.loadPreset.mockResolvedValue(JSON.stringify(PRESET_STYLE))
    render(<PresetsBar />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Load preset saved' }))

    await waitFor(() => {
      expect(useMapStore.getState().style).toEqual(PRESET_STYLE)
      expect(useMapStore.getState().layerMap).toEqual(buildLayerMapFromStyle(PRESET_STYLE))
    })
  })

  it('deletes a preset and refreshes the list', async () => {
    let currentList = [{ name: 'saved', mtime: 1 }]
    api.listPresets.mockImplementation(async () => currentList)
    api.deletePreset.mockImplementation(async (name: string) => {
      currentList = currentList.filter((preset) => preset.name !== name)
    })
    render(<PresetsBar />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Delete preset saved' }))

    await waitFor(() => expect(api.deletePreset).toHaveBeenCalledWith('saved'))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load preset saved' })).not.toBeInTheDocument()
    )
  })
})
