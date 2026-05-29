import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { spawn, spawnSync, ChildProcess } from 'child_process'
import * as http from 'http'

const EXAMPLES_DIR = app.isPackaged
  ? join(process.resourcesPath, 'examples')
  : join(app.getAppPath(), 'resources', 'examples')

const BUNDLED_EXAMPLES = [
  {
    id: 'azhora',
    name: 'Azhora',
    description: 'The continent of Azhora on the planet Corav — a prototype world-building example with terrain, regions, rivers, and settlements.',
    filename: 'azhora.wwmap',
  },
]

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Worldwright',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Map file IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('map:save', async (_, jsonData: string, filePath?: string) => {
  let targetPath = filePath
  if (!targetPath) {
    const result = await dialog.showSaveDialog({
      title: 'Save Map',
      defaultPath: 'my-world.wwmap',
      filters: [{ name: 'Worldwright Map', extensions: ['wwmap'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    targetPath = result.filePath
  }
  writeFileSync(targetPath, jsonData, 'utf-8')
  return { filePath: targetPath }
})

ipcMain.handle('map:load', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open Map',
    filters: [{ name: 'Worldwright Map', extensions: ['wwmap', 'azmap'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  const raw = readFileSync(result.filePaths[0], 'utf-8')
  return { data: raw, filePath: result.filePaths[0] }
})

ipcMain.handle('map:load-by-path', async (_, path: string) => {
  try {
    const raw = readFileSync(path, 'utf-8')
    return { data: raw, filePath: path }
  } catch {
    return { canceled: true, error: 'File not found or unreadable.' }
  }
})

ipcMain.handle('map:choose-image', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Underlay Image',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  const buf  = readFileSync(result.filePaths[0])
  const ext  = result.filePaths[0].split('.').pop()?.toLowerCase() ?? 'png'
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
  return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, filePath: result.filePaths[0] }
})

// ── Example maps IPC ──────────────────────────────────────────────────────────

ipcMain.handle('map:list-examples', () =>
  BUNDLED_EXAMPLES.map(({ id, name, description }) => ({ id, name, description }))
)

ipcMain.handle('map:load-example', (_, id: string) => {
  const ex = BUNDLED_EXAMPLES.find(e => e.id === id)
  if (!ex) return { canceled: true, error: 'Unknown example.' }
  try {
    const raw = readFileSync(join(EXAMPLES_DIR, ex.filename), 'utf-8')
    return { data: raw }
  } catch {
    return { canceled: true, error: 'Example file not found.' }
  }
})

// ── Recent files IPC ──────────────────────────────────────────────────────────

interface RecentFile { path: string; name: string; savedAt: string }
const RECENT_MAX = 20

function recentPath() {
  return join(app.getPath('userData'), 'recent.json')
}

function readRecent(): RecentFile[] {
  try {
    const p = recentPath()
    if (!existsSync(p)) return []
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch { return [] }
}

function writeRecent(files: RecentFile[]) {
  try { writeFileSync(recentPath(), JSON.stringify(files), 'utf-8') } catch {}
}

ipcMain.handle('map:list-recent', () => readRecent())

ipcMain.handle('map:add-recent', (_, path: string, name: string) => {
  const files = readRecent().filter(f => f.path !== path)
  files.unshift({ path, name, savedAt: new Date().toISOString() })
  if (files.length > RECENT_MAX) files.length = RECENT_MAX
  writeRecent(files)
})

// ── Simulation subprocess ─────────────────────────────────────────────────────

const PYTHON_CMD       = process.env.WW_PYTHON          ?? 'python'
const CLASHVERGENCE_DIR = process.env.WW_CLASHVERGENCE_DIR
  ?? join(app.getAppPath(), '..', '..', 'Clashvergence')
const TRANSLATOR_SCRIPT = process.env.WW_TRANSLATOR
  ?? join(app.getAppPath(), '..', 'wwmap_to_clashvergence.py')
const SIM_PORT = 18765

let simProcess: ChildProcess | null = null

function simGet(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${SIM_PORT}${path}`, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
  })
}

function simPost(path: string, body: object): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = http.request(
      { hostname: '127.0.0.1', port: SIM_PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk })
        res.on('end', () => resolve(data))
      },
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function waitForServer(maxMs = 20_000): Promise<void> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try { await simGet('/api/health'); return } catch { /* not ready yet */ }
    await new Promise<void>((r) => setTimeout(r, 250))
  }
  throw new Error('Clashvergence server did not start within 20 s.')
}

// ── Simulation IPC ────────────────────────────────────────────────────────────

ipcMain.handle('sim:start', async (_, mapFilePath: string) => {
  if (simProcess) { simProcess.kill(); simProcess = null }

  const cmapPath = mapFilePath.endsWith('.wwmap')
    ? mapFilePath.replace(/\.wwmap$/, '.cmap.json')
    : mapFilePath + '.cmap.json'

  const xResult = spawnSync(PYTHON_CMD, [TRANSLATOR_SCRIPT, mapFilePath, cmapPath], { encoding: 'utf-8' })
  if (xResult.status !== 0) {
    return { ok: false, error: xResult.stderr || 'Translator failed.' }
  }

  simProcess = spawn(
    PYTHON_CMD,
    [join(CLASHVERGENCE_DIR, 'main.py'), '--map-file', cmapPath, '--game-server', '--port', String(SIM_PORT)],
    { cwd: CLASHVERGENCE_DIR },
  )

  try {
    await waitForServer()
    const raw = await simGet('/api/world')
    return { ok: true, world: JSON.parse(raw) }
  } catch (e: any) {
    simProcess?.kill(); simProcess = null
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('sim:stop', () => {
  if (simProcess) { simProcess.kill(); simProcess = null }
  return { ok: true }
})

ipcMain.handle('sim:world', async () => {
  try {
    return JSON.parse(await simGet('/api/world'))
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('sim:advance', async () => {
  try {
    const stateRaw = await simGet('/api/state')
    const state = JSON.parse(stateRaw)
    const actions: Array<{ action_id: string }> = state.state?.available_actions ?? []
    const actionId = actions[0]?.action_id ?? 'hold'
    await simPost('/api/action', { action_id: actionId })
    return JSON.parse(await simGet('/api/world'))
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
})

app.on('before-quit', () => {
  if (simProcess) { simProcess.kill(); simProcess = null }
})
