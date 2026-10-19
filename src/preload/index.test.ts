import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { ExportJobSpec } from '../main/export/exportSession'

const { ipcRenderer, contextBridge } = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  contextBridge,
  ipcRenderer,
}))

import '../preload/index'

const api = (contextBridge.exposeInMainWorld as Mock).mock.calls.find(
  (entry) => entry[0] === 'api'
)?.[1] as Record<string, (...args: unknown[]) => unknown> | undefined

if (!api) {
  throw new Error('api was not exposed on window')
}

const SPEC: ExportJobSpec = {
  mode: 'flat',
  container: 'png-folder',
  cols: 1,
  rows: 1,
  chunkPx: 2048,
  actualWidth: 2048,
  actualHeight: 2048,
  outWidth: 2048,
  outHeight: 2048,
  groups: [],
  outPath: 'C:/out/map.png',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('preload export api wiring', () => {
  it('beginExport pairs with ipcMain.handle via invoke', () => {
    api.beginExport(SPEC)
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('export:begin', SPEC)
    expect(ipcRenderer.send).not.toHaveBeenCalledWith('export:begin', expect.anything())
  })

  it('sendChunk and cancelExport use one-way send', () => {
    api.sendChunk('Flat', 0, 0, new ArrayBuffer(8))
    expect(ipcRenderer.send).toHaveBeenCalledWith('export:chunk', 'Flat', 0, 0, expect.any(ArrayBuffer))
    api.cancelExport()
    expect(ipcRenderer.send).toHaveBeenCalledWith('export:cancel')
  })
})
