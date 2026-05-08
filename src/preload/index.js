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
  },
  pacientes: {
    list: () => ipcRenderer.invoke('pacientes:list'),
    listInactivos: () => ipcRenderer.invoke('pacientes:list-inactivos'),
    create: (data) => ipcRenderer.invoke('pacientes:create', data),
    update: (data) => ipcRenderer.invoke('pacientes:update', data),
    deactivate: (id) => ipcRenderer.invoke('pacientes:deactivate', { paciente_id: id })
  },
  alumnos: {
    list: () => ipcRenderer.invoke('alumnos:list'),
    listInactivos: () => ipcRenderer.invoke('alumnos:list-inactivos'),
    create: (data) => ipcRenderer.invoke('alumnos:create', data),
    update: (data) => ipcRenderer.invoke('alumnos:update', data),
    deactivate: (id) => ipcRenderer.invoke('alumnos:deactivate', { alumno_id: id })
  },
  alumnos_particulares: {
    list: () => ipcRenderer.invoke('alumnos_particulares:list'),
    listInactivos: () => ipcRenderer.invoke('alumnos_particulares:list-inactivos'),
    create: (data) => ipcRenderer.invoke('alumnos_particulares:create', data),
    update: (data) => ipcRenderer.invoke('alumnos_particulares:update', data),
    deactivate: (id) =>
      ipcRenderer.invoke('alumnos_particulares:deactivate', { alumno_particular_id: id })
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
