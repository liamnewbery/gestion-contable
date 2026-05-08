import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function backupFilename() {
  const d = new Date()
  return `gestion-contable-backup-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.sqlite`
}

export function registerDbHandlers(db, dbPath) {
  ipcMain.handle('db:backup', async () => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      // Si el checkpoint falla, seguimos: la copia del .db es válida igual.
    }

    let saveResult
    try {
      const win = BrowserWindow.getFocusedWindow()
      const defaultPath = path.join(app.getPath('downloads'), backupFilename())
      saveResult = await dialog.showSaveDialog(win ?? undefined, {
        defaultPath,
        filters: [{ name: 'SQLite', extensions: ['sqlite'] }]
      })
    } catch (err) {
      return { ok: false, error: { code: 'DIALOG_FAILED', message: err.message } }
    }

    if (saveResult.canceled || !saveResult.filePath) {
      return { ok: true, data: { cancelado: true } }
    }

    try {
      await fs.copyFile(dbPath, saveResult.filePath)
      return { ok: true, data: { cancelado: false } }
    } catch (err) {
      return { ok: false, error: { code: 'COPY_FAILED', message: err.message } }
    }
  })

  ipcMain.handle('db:restore', async () => {
    let openResult
    try {
      const win = BrowserWindow.getFocusedWindow()
      openResult = await dialog.showOpenDialog(win ?? undefined, {
        properties: ['openFile'],
        filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }]
      })
    } catch (err) {
      return { ok: false, error: { code: 'DIALOG_FAILED', message: err.message } }
    }

    if (openResult.canceled || !openResult.filePaths || openResult.filePaths.length === 0) {
      return { ok: true, data: { cancelado: true } }
    }

    const sourcePath = openResult.filePaths[0]

    try {
      db.close()
    } catch {
      // Ignoramos errores al cerrar — la copia es lo importante.
    }

    try {
      await fs.copyFile(sourcePath, dbPath)
    } catch (err) {
      return { ok: false, error: { code: 'COPY_FAILED', message: err.message } }
    }

    BrowserWindow.getAllWindows().forEach((w) => w.destroy())
    setImmediate(() => {
      app.relaunch()
      app.quit()
    })
    return { ok: true, data: { cancelado: false } }
  })
}
