import { dialog, ipcMain } from 'electron'
import { ExportSession, type ExportJobSpec } from './export/exportSession'

let activeSession: ExportSession | null = null

export type ExportPathKind = 'psd' | 'png-folder' | 'png'

export function registerExportIpc(): void {
  ipcMain.handle('export:begin', (event, spec: ExportJobSpec) => {
    activeSession?.cancel()
    activeSession = new ExportSession(spec, (p) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('export:progress', p)
      }
    })
  })

  ipcMain.on(
    'export:chunk',
    (_event, groupLabel: string, col: number, row: number, png: ArrayBuffer) => {
      const session = activeSession
      if (!session) return
      void session
        .addChunk(groupLabel, { col, row, png: Buffer.from(png) })
        .catch(() => {})
    }
  )

  ipcMain.handle('export:finish', async () => {
    const session = activeSession
    if (!session) throw new Error('No active export session')
    try {
      await session.finish()
    } finally {
      activeSession = null
    }
  })

  ipcMain.on('export:cancel', () => {
    activeSession?.cancel()
  })

  ipcMain.handle('export:select-path', async (event, defaultName: string, kind?: ExportPathKind) => {
    if (kind === 'png-folder') {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
      })
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    }
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters:
        kind === 'psd'
          ? [{ name: 'Photoshop PSD', extensions: ['psd'] }]
          : [{ name: 'PNG Image', extensions: ['png'] }],
    })
    return result.canceled || !result.filePath ? null : result.filePath
  })
}
