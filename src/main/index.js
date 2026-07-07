import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  const { db, dbPath } = await import('./database/db.js')
  const { registerGruposHandlers } = await import('./ipc/grupos.js')
  const { registerPacientesHandlers } = await import('./ipc/pacientes.js')
  const { registerAlumnosHandlers } = await import('./ipc/alumnos.js')
  const { registerAlumnosParticularesHandlers } = await import('./ipc/alumnos_particulares.js')
  const { registerDashboardHandlers } = await import('./ipc/dashboard.js')
  const { registerConfiguracionHandlers, registerAuthHandlers } =
    await import('./ipc/configuracion.js')
  const { registerMailHandlers, revisarMails } = await import('./ipc/mail.js')
  const { registerPagosHandlers } = await import('./ipc/pagos.js')
  const { registerReportesHandlers } = await import('./ipc/reportes.js')
  const { registerDbHandlers } = await import('./ipc/db.js')
  registerGruposHandlers(db)
  registerPacientesHandlers(db)
  registerAlumnosHandlers(db)
  registerAlumnosParticularesHandlers(db)
  registerDashboardHandlers(db)
  registerConfiguracionHandlers(db)
  registerAuthHandlers(db)
  registerMailHandlers(db)
  registerPagosHandlers(db)
  registerReportesHandlers(db)
  registerDbHandlers(db, dbPath)

  // Revisión inicial de mails al arrancar — fire and forget
  revisarMails(db)
    .then((result) => {
      if (result.procesados > 0 || result.errores.length > 0) {
        log.info(
          `Mail revision al arrancar: procesados=${result.procesados}, errores=${result.errores.length}`
        )
        for (const e of result.errores) {
          log.warn(`  uid=${e.uid}: ${e.mensaje}`)
        }
      }
    })
    .catch((err) => {
      log.error('Mail revision al arrancar falló:', err)
    })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Auto-update desde GitHub Releases (solo en la app empaquetada).
  // Chequea al arrancar; si hay versión nueva la descarga en segundo plano,
  // avisa con una notificación y la instala al cerrar la app.
  if (!is.dev) {
    autoUpdater.logger = log
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.error('Auto-update falló:', err)
    })
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
