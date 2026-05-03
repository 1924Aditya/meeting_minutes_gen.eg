const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, shell } = require('electron')
const path  = require('path')
const fs    = require('fs')
const { spawn } = require('child_process')

// ── Dev vs Production ────────────────────────────────────────────────────────
const isDev = !app.isPackaged
const VITE_URL = 'http://localhost:5173'

// ── Processes ───────────────────────────────────────────────────────────────
let pythonProcess = null
let backendProcess = null

function startBackend() {
  const backendDir = isDev
    ? path.join(__dirname, '../../backend')
    : path.join(process.resourcesPath, 'backend')

  console.log(`[Main] Starting Node Backend (Internal Engine)...`)
  
  // We use process.execPath (Electron) to run the backend script 
  // so that native modules (sqlite) match perfectly.
  backendProcess = spawn(process.execPath, ['src/index.js'], {
    cwd: backendDir,
    env: { 
      ...process.env, 
      BACKEND_PORT: '3001', 
      AI_SERVICE_PORT: '8766',
      NODE_PATH: path.join(backendDir, 'node_modules'),
      ELECTRON_RUN_AS_NODE: '1'
    },
    shell: true
  })

  backendProcess.stdout.on('data', (d) => console.log(`[Backend] ${d.toString().trim()}`))
  backendProcess.stderr.on('data', (d) => console.error(`[Backend ERR] ${d.toString().trim()}`))
  backendProcess.on('error', (err) => console.error(`[Main] Backend failed to start: ${err.message}`))
}

function startPythonSidecar() {
  const scriptDir = isDev
    ? path.join(__dirname, '../../services/ai')
    : path.join(process.resourcesPath, 'ai_service')

  const executable = isDev 
    ? path.join(scriptDir, 'venv', 'Scripts', 'python.exe') 
    : path.join(scriptDir, 'ai_service.exe')
  
  console.log(`[Main] Spawning AI sidecar: ${executable}`)

  const pythonArgs = isDev ? ['-u', 'main.py'] : []

  pythonProcess = spawn(executable, pythonArgs, {
    cwd: scriptDir,
    env: { ...process.env, AI_SERVICE_PORT: '8766' },
    shell: true
  })

  pythonProcess.stdout.on('data', (d) => console.log(`[AI] ${d.toString().trim()}`))
  pythonProcess.stderr.on('data', (d) => console.error(`[AI ERR] ${d.toString().trim()}`))
  pythonProcess.on('error', (err) => console.error(`[Main] AI Sidecar failed to start: ${err.message}`))

  // Kill existing processes on the same port (Windows)
  if (isDev) {
    try {
      const { execSync } = require('child_process')
      // Find PID on port 8766 and kill it
      const stdout = execSync(`netstat -ano | findstr :8766`).toString()
      const lines  = stdout.split('\n').filter(l => l.includes('LISTENING'))
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/)
        const pid   = parts[parts.length - 1]
        if (pid && pid !== '0') {
          console.log(`[Main] Killing existing AI service on port 8766 (PID: ${pid})`)
          execSync(`taskkill /F /PID ${pid}`)
        }
      })
    } catch (err) {
      // Ignore if no process found
    }
  }

  console.log(`[Main] Python AI sidecar started`)
}

// ── Create Window ─────────────────────────────────────────────────────────────
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 860,
    minWidth:  900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(14,14,20,0)',
      symbolColor: '#aaa',
      height: 60
    },
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload:           path.join(__dirname, 'preload.js'),
      contextIsolation:  true,
      nodeIntegration:   false,
      webSecurity:       true,
      // Allow desktopCapturer
      experimentalFeatures: true
    },
    show: false,
    icon: fs.existsSync(path.join(__dirname, '../public/icon.ico')) 
      ? path.join(__dirname, '../public/icon.ico') 
      : undefined
  })

  // Load app
  if (isDev) {
    mainWindow.loadURL(VITE_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch(err => {
      console.error('[Main] Failed to load index.html:', err)
    })
  }

  // Handle load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Main] Page failed to load: ${errorDescription} (${errorCode}) at ${validatedURL}`)
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startBackend()
  startPythonSidecar()
  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
})

app.on('window-all-closed', () => {
  console.log('[Main] All windows closed')
  if (backendProcess) {
    console.log('[Main] Killing Node Backend...')
    backendProcess.kill()
  }
  if (pythonProcess) {
    console.log('[Main] Killing Python sidecar...')
    pythonProcess.kill()
  }
  if (process.platform !== 'darwin') {
    console.log('[Main] Quitting app...')
    app.quit()
  }
})

app.on('before-quit', (event) => {
  console.log('[Main] App before-quit')
  if (pythonProcess) pythonProcess.kill()
})

app.on('will-quit', () => {
  console.log('[Main] App will-quit')
})

app.on('quit', (event, exitCode) => {
  console.log(`[Main] App quit with code: ${exitCode}`)
})

// ── IPC Handlers ─────────────────────────────────────────────────────────────

// Desktop sources (screen / app)
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 0, height: 0 }
  })
  const formatted = [
    { id: 'mic-default', name: 'Microphone (Default)', type: 'mic' },
    ...sources.map(s => ({
      id:   s.id,
      name: s.name,
      type: s.id.startsWith('screen') ? 'screen' : 'window'
    }))
  ]
  return formatted
})

// First-run check
ipcMain.handle('is-first-run', async () => {
  const configDir  = app.getPath('userData')
  const markerFile = path.join(configDir, '.setup_complete')
  return !fs.existsSync(markerFile)
})

// Mark setup done
ipcMain.handle('mark-setup-done', async () => {
  const configDir  = app.getPath('userData')
  const markerFile = path.join(configDir, '.setup_complete')
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(markerFile, new Date().toISOString())
})

// Start model downloads — delegates to Python sidecar via IPC/WS
ipcMain.handle('start-downloads', async (event, { hfToken, skipDiarize }) => {
  // Store token securely
  const configDir = app.getPath('userData')
  const configFile = path.join(configDir, 'config.json')
  const config = { hfToken, skipDiarize, setupAt: new Date().toISOString() }
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
  // The backend will handle actual downloads after reading this config
  return { ok: true }
})

// Export file (Markdown or PDF)
ipcMain.handle('export-file', async (event, { content, type }) => {
  const ext      = type === 'pdf' ? 'pdf' : 'md'
  const name     = `MOM_${new Date().toISOString().slice(0,10)}`
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title:       'Save Minutes of Meeting',
    defaultPath: `${name}.${ext}`,
    filters:     type === 'pdf'
      ? [{ name: 'PDF', extensions: ['pdf'] }]
      : [{ name: 'Markdown', extensions: ['md'] }]
  })

  if (canceled || !filePath) return { ok: false }

  if (type === 'markdown') {
    fs.writeFileSync(filePath, content, 'utf-8')
    shell.showItemInFolder(filePath)
    return { ok: true, path: filePath }
  }

  if (type === 'pdf') {
    try {
      // Create a hidden window to render the 'carbon copy' print version
      const printWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
      
      // Use a high-fidelity HTML template for the 'carbon copy' document
      const html = `
        <html>
          <head>
            <style>
              body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto; padding: 50px; color: #111; line-height: 1.6; }
              h1 { color: #1d4ed8; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px; font-size: 28px; }
              h2 { color: #334155; margin-top: 40px; border-left: 4px solid #3b82f6; padding-left: 15px; font-size: 20px; }
              p, li { font-size: 15px; color: #334155; }
              strong { color: #0f172a; }
              .meta { margin-bottom: 30px; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
              .segment { margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9; }
              .speaker { font-weight: bold; color: #334155; }
              .timestamp { color: #94a3b8; font-family: monospace; font-size: 11px; margin-right: 8px; }
            </style>
          </head>
          <body>
            ${content.replace(/# (.*)/g, '<h1>$1</h1>')
                     .replace(/## (.*)/g, '<h2>$1</h2>')
                     .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                     .replace(/\n/g, '<br>')}
          </body>
        </html>
      `
      
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const data = await printWindow.webContents.printToPDF({
        printBackground: true,
        margins: { top: 30, bottom: 30, left: 30, right: 30 }
      })
      
      fs.writeFileSync(filePath, data)
      printWindow.close()
      shell.showItemInFolder(filePath)
      return { ok: true, path: filePath }
    } catch (err) {
      console.error('PDF generation failed:', err)
      return { ok: false, error: err.message }
    }
  }

  // Handle Notepad (.txt) export
  if (type === 'txt') {
    fs.writeFileSync(filePath, content, 'utf-8')
    shell.showItemInFolder(filePath)
    return { ok: true, path: filePath }
  }
})

// Window controls (frameless)
ipcMain.handle('window-minimize', () => mainWindow?.minimize())
ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window-close', () => mainWindow?.close())

// Forward download progress from backend → renderer
ipcMain.on('forward-download-progress', (event, data) => {
  mainWindow?.webContents.send('download-progress', data)
})
