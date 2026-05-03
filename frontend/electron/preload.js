const { contextBridge, ipcRenderer } = require('electron')

// ── SAMVAAD Safe API ──────────────────────────────────────────────────────────
// Only exposes explicitly allowed IPC channels to the renderer.
// Node APIs are NEVER exposed directly.

contextBridge.exposeInMainWorld('samvaad', {
  // Source discovery
  getSources: () => ipcRenderer.invoke('get-sources'),

  // First-run
  isFirstRun:    () => ipcRenderer.invoke('is-first-run'),
  markSetupDone: () => ipcRenderer.invoke('mark-setup-done'),
  startDownloads: (opts) => ipcRenderer.invoke('start-downloads', opts),

  // Download progress listener
  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('download-progress', handler)
    // Return unsubscribe function
    return () => ipcRenderer.removeListener('download-progress', handler)
  },

  // File export
  exportFile: (opts) => ipcRenderer.invoke('export-file', opts),

  // Window controls (frameless)
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose:    () => ipcRenderer.invoke('window-close'),

  // Platform info (read-only)
  platform: process.platform
})
