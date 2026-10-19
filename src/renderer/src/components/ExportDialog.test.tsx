// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import ExportDialog from './ExportDialog'
import { useExportStore } from '../stores/exportStore'
import type { ExportMainProgress } from '../stores/exportStore'
import { useMapStore } from '../stores/mapStore'
import { planChunks, worldPxToLngLat } from '../lib/chunkPlan'
import type { CropBounds } from '../lib/chunkPlan'
import type { StyleSpecification } from 'maplibre-gl'

const { renderChunkMock } = vi.hoisted(() => ({ renderChunkMock: vi.fn() }))

vi.mock('../lib/chunkRenderer', () => ({
  ChunkRenderer: class {
    ensureStyle = async () => {}
    renderChunk = renderChunkMock
    destroy = vi.fn()
  },
}))

const api = {
  beginExport: vi.fn(),
  sendChunk: vi.fn(),
  finishExport: vi.fn(async () => {}),
  cancelExport: vi.fn(),
  onExportProgress: vi.fn((_cb: (p: ExportMainProgress) => void) => () => {}),
  selectExportPath: vi.fn(async () => 'C:/out/map.png'),
  savePreset: vi.fn(async () => {}),
  listPresets: vi.fn(async () => []),
  loadPreset: vi.fn(async () => null),
  deletePreset: vi.fn(async () => {}),
}

const BOUNDS: CropBounds = { west: 0, south: 0, east: 1, north: 1 }

const STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'water-fill', type: 'fill', paint: { 'fill-color': '#1191bd' } }],
} as unknown as StyleSpecification

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = api
  useMapStore.setState({ style: STYLE, layerMap: {}, selectedCategoryId: null })
  renderChunkMock.mockImplementation(
    async (_plan: unknown, chunk: { col: number; row: number }) => ({
      col: chunk.col,
      row: chunk.row,
      png: new ArrayBuffer(8),
    })
  )
  useExportStore.setState({
    mapInstance: null,
    cropMode: false,
    cropBounds: null,
    dialogOpen: true,
    mode: 'flat',
    container: 'psd',
    sizePreset: '4K',
    customLongEdge: 3840,
    attribution: true,
    exporting: false,
    status: 'idle',
    renderDone: 0,
    renderTotal: 0,
    compositeDone: 0,
    compositeTotal: 0,
    outputPath: null,
    message: null,
    abortController: null,
  })
})

afterEach(() => {
  cleanup()
})

describe('ExportDialog', () => {
  it('clamps a custom size above 16K down to 16384', async () => {
    const user = userEvent.setup()
    render(<ExportDialog />)
    const input = screen.getByLabelText('Custom long edge')

    await user.clear(input)
    await user.type(input, '20000')

    expect((input as HTMLInputElement).value).toBe('16384')
    expect(useExportStore.getState().customLongEdge).toBe(16384)
    expect(useExportStore.getState().sizePreset).toBe('custom')
  })

  it('shows container options only for layered mode and toggles them', async () => {
    const user = userEvent.setup()
    render(<ExportDialog />)

    expect(screen.queryByRole('radio', { name: 'PSD' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Layered' }))
    expect(useExportStore.getState().mode).toBe('layered')
    expect(screen.getByRole('radio', { name: 'PSD' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'PNG folder' }))
    expect(useExportStore.getState().container).toBe('png-folder')

    await user.click(screen.getByRole('radio', { name: 'Flat' }))
    expect(useExportStore.getState().mode).toBe('flat')
    expect(screen.queryByRole('radio', { name: 'PSD' })).not.toBeInTheDocument()
  })

  it('keeps attribution on unless the removal warning is accepted', async () => {
    const user = userEvent.setup()
    render(<ExportDialog />)
    const checkbox = screen.getByRole('checkbox', { name: 'Include attribution' })
    expect(checkbox).toBeChecked()

    await user.click(checkbox)
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/Open Database License/i)

    await user.click(screen.getByRole('button', { name: 'Keep attribution' }))
    expect(checkbox).toBeChecked()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await user.click(checkbox)
    await user.click(screen.getByRole('button', { name: 'Remove attribution' }))
    expect(checkbox).not.toBeChecked()
    expect(useExportStore.getState().attribution).toBe(false)
  })

  it('disables Export without crop bounds and enables it once bounds exist', async () => {
    render(<ExportDialog />)
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(screen.getByText(/select an export area/i)).toBeInTheDocument()

    useExportStore.setState({ cropBounds: BOUNDS })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled()
    )
  })

  it('applies an aspect-ratio lock by re-centering the stored crop bounds', async () => {
    const bounds: CropBounds = {
      west: -18,
      east: 18,
      south: worldPxToLngLat(0, 512 * 0.55, 0).lat,
      north: worldPxToLngLat(0, 512 * 0.45, 0).lat,
    }
    useExportStore.setState({ cropBounds: bounds })
    const user = userEvent.setup()
    render(<ExportDialog />)

    await user.click(screen.getByRole('radio', { name: '16:9' }))

    const state = useExportStore.getState()
    expect(state.aspectRatio).toBe('16:9')
    expect(state.cropBounds).not.toBe(bounds)
    expect(state.cropBounds!.south).toBeCloseTo(bounds.south, 10)
    expect(state.cropBounds!.north).toBeCloseTo(bounds.north, 10)
    expect((state.cropBounds!.east - state.cropBounds!.west) / 360).toBeCloseTo(0.1 * (16 / 9), 9)
    expect((state.cropBounds!.east + state.cropBounds!.west) / 2).toBeCloseTo(0, 9)

    await user.click(screen.getByRole('radio', { name: 'Free' }))
    expect(useExportStore.getState().aspectRatio).toBe('free')
  })

  it('clicking Export streams the chunk flow through the export IPC', async () => {
    useExportStore.setState({ cropBounds: BOUNDS })
    const user = userEvent.setup()
    render(<ExportDialog />)

    await user.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() => expect(api.finishExport).toHaveBeenCalledTimes(1))
    const plan = planChunks(BOUNDS, 3840)
    expect(api.selectExportPath).toHaveBeenCalledWith('map.png', 'png')
    expect(api.beginExport).toHaveBeenCalledTimes(1)
    expect(api.beginExport.mock.calls[0][0]).toMatchObject({
      mode: 'flat',
      cols: plan.cols,
      rows: plan.rows,
      outPath: 'C:/out/map.png',
      attribution: '© OpenStreetMap contributors',
    })
    expect(api.sendChunk).toHaveBeenCalledTimes(plan.chunks.length)
    expect(useExportStore.getState().status).toBe('done')
  })

  it('cancel aborts the run and notifies the main process', async () => {
    useExportStore.setState({ cropBounds: BOUNDS })
    renderChunkMock.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    render(<ExportDialog />)

    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(api.cancelExport).toHaveBeenCalledTimes(1)
    expect(useExportStore.getState().abortController?.signal.aborted).toBe(true)
  })

  it('keeps the main-process error message instead of double-reporting the finish rejection', async () => {
    let progressCb: ((p: ExportMainProgress) => void) | null = null
    api.onExportProgress.mockImplementation((cb: (p: ExportMainProgress) => void) => {
      progressCb = cb
      return () => {}
    })
    api.sendChunk.mockImplementation(() => {
      progressCb?.({ stage: 'error', message: 'Composite failed' })
    })
    api.finishExport.mockRejectedValueOnce(new Error('Export failed: Composite failed'))
    useExportStore.setState({ cropBounds: BOUNDS })
    const user = userEvent.setup()
    render(<ExportDialog />)

    await user.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() => expect(useExportStore.getState().status).toBe('error'))
    expect(useExportStore.getState().message).toBe('Composite failed')
  })

  it('unwedges the dialog when main reports done before finishExport resolves', async () => {
    let progressCb: ((p: ExportMainProgress) => void) | null = null
    api.onExportProgress.mockImplementation((cb: (p: ExportMainProgress) => void) => {
      progressCb = cb
      return () => {}
    })
    let resolveFinish: (() => void) | null = null
    api.finishExport.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFinish = resolve
        })
    )
    api.sendChunk.mockImplementation(() => {
      progressCb?.({ stage: 'done', path: 'C:/out/map.png' })
    })
    useExportStore.setState({ cropBounds: BOUNDS })
    const user = userEvent.setup()
    render(<ExportDialog />)

    await user.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() => expect(useExportStore.getState().status).toBe('done'))
    expect(useExportStore.getState().outputPath).toBe('C:/out/map.png')
    expect(useExportStore.getState().exporting).toBe(false)
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()

    await act(async () => {
      resolveFinish?.()
    })
    await waitFor(() => expect(useExportStore.getState().exporting).toBe(false))
    expect(useExportStore.getState().status).toBe('done')
  })
})
