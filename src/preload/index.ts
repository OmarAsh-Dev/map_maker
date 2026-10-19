import { contextBridge, ipcRenderer } from 'electron'

export interface PresetMeta {
  name: string
  mtime: number
}

const api = {
  savePreset: (name: string, styleJson: string): Promise<void> =>
    ipcRenderer.invoke('presets:save', name, styleJson),
  listPresets: (): Promise<PresetMeta[]> => ipcRenderer.invoke('presets:list'),
  loadPreset: (name: string): Promise<string | null> =>
    ipcRenderer.invoke('presets:load', name),
  deletePreset: (name: string): Promise<void> =>
    ipcRenderer.invoke('presets:delete', name)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
