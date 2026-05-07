import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  grupos: {
    list: () => ipcRenderer.invoke('grupos:list'),
    listInactivos: () => ipcRenderer.invoke('grupos:list-inactivos'),
    create: (data) => ipcRenderer.invoke('grupos:create', data),
    update: (data) => ipcRenderer.invoke('grupos:update', data),
    deactivate: (id) => ipcRenderer.invoke('grupos:deactivate', { id })
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
