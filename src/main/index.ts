import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerExportIpc } from './ipc'
import { PresetStore } from './presets'

app.setName('Map Maker')
app.userAgentFallback = 'MapMaker/1.1 (' + app.userAgentFallback + ')'

function registerIpcHandlers(): void {
  const presets = new PresetStore(join(app.getPath('userData'), 'presets'))

  ipcMain.handle('presets:save', (_event, name: string, styleJson: string) =>
    presets.save(name, styleJson)
  )
  ipcMain.handle('presets:list', () => presets.list())
  ipcMain.handle('presets:load', (_event, name: string) => presets.load(name))
  ipcMain.handle('presets:delete', (_event, name: string) => presets.remove(name))

  registerExportIpc()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'Map Maker',
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
