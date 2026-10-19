import { contextBridge, ipcRenderer } from 'electron'
import type { ExportJobSpec, ExportProgress } from '../main/export/exportSession'

export interface PresetMeta {
  name: string
  mtime: number
}

export type ExportPathKind = 'psd' | 'png-folder' | 'png'

const api = {
  savePreset: (name: string, styleJson: string): Promise<void> =>
    ipcRenderer.invoke('presets:save', name, styleJson),
  listPresets: (): Promise<PresetMeta[]> => ipcRenderer.invoke('presets:list'),
  loadPreset: (name: string): Promise<string | null> =>
    ipcRenderer.invoke('presets:load', name),
  deletePreset: (name: string): Promise<void> =>
    ipcRenderer.invoke('presets:delete', name),
  beginExport: (spec: ExportJobSpec): void => {
    ipcRenderer.send('export:begin', spec)
  },
  sendChunk: (groupLabel: string, col: number, row: number, png: ArrayBuffer): void => {
    ipcRenderer.send('export:chunk', groupLabel, col, row, png)
  },
  finishExport: (): Promise<void> => ipcRenderer.invoke('export:finish'),
  cancelExport: (): void => {
    ipcRenderer.send('export:cancel')
  },
  onExportProgress: (cb: (p: ExportProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: ExportProgress): void => {
      cb(p)
    }
    ipcRenderer.on('export:progress', listener)
    return () => {
      ipcRenderer.removeListener('export:progress', listener)
    }
  },
  selectExportPath: (defaultName: string, kind?: ExportPathKind): Promise<string | null> =>
    ipcRenderer.invoke('export:select-path', defaultName, kind)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
