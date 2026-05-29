import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { spawn, spawnSync, ChildProcess } from 'child_process'
import * as http from 'http'
import * as net from 'net'

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
    title: 'World Builder',
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
      filters: [{ name: 'World Builder Map', extensions: ['wwmap'] }],
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
    filters: [{ name: 'World Builder Map', extensions: ['wwmap', 'azmap'] }],
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
// app.getAppPath() = .../typescript/world-builder/map  (in dev)
// Clashvergence:     .../python/Clashvergence  (3 dirs up, then python/)
// Claudevergence:    .../python/claudevergence  (3 dirs up, then python/)
// Translators:       .../typescript/world-builder/wwmap_to_*.py (1 dir up)

const PYTHON_CMD             = process.env.WW_PYTHON              ?? 'python'
const CLASHVERGENCE_DIR      = process.env.WW_CLASHVERGENCE_DIR
  ?? join(app.getAppPath(), '..', '..', '..', 'python', 'Clashvergence')
const CLAUDEVERGENCE_DIR     = process.env.WW_CLAUDEVERGENCE_DIR
  ?? join(app.getAppPath(), '..', '..', '..', 'python', 'claudevergence')
const CV_TRANSLATOR_SCRIPT   = process.env.WW_CV_TRANSLATOR
  ?? join(app.getAppPath(), '..', 'wwmap_to_clashvergence.py')
const CV2_TRANSLATOR_SCRIPT  = process.env.WW_CV2_TRANSLATOR
  ?? join(app.getAppPath(), '..', 'wwmap_to_claudevergence.py')
const SIM_PORT = 18765

let simProcess: ChildProcess | null = null
let simPid: number | undefined
let simMapPath: string | null = null
let simNumFactions: number = 4
let simType: string = 'clashvergence'

function killSimProcess() {
  if (!simProcess) return
  if (process.platform === 'win32' && simPid != null) {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(simPid)], { encoding: 'utf-8' })
  } else {
    simProcess.kill()
  }
  simProcess = null
  simPid = undefined
}

function isPortListening(port: number, timeoutMs = 300): Promise<boolean> {
  return new Promise(resolve => {
    const sock = new net.Socket()
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => { sock.destroy(); resolve(true) })
    sock.once('error', () => resolve(false))
    sock.once('timeout', () => { sock.destroy(); resolve(false) })
    sock.connect(port, '127.0.0.1')
  })
}

async function waitForPortFree(maxMs = 8000): Promise<boolean> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (!(await isPortListening(SIM_PORT))) return true
    await new Promise<void>((r) => setTimeout(r, 200))
  }
  return false
}

async function _spawnServer(
  resolvedMapPath: string,
  numFactions: number,
  requestedSimType: string = 'clashvergence',
): Promise<{ ok: boolean; error?: string }> {
  killSimProcess()

  // Kill any process LISTENING on our port (e.g. an orphan from a crashed previous session).
  // We pipe through `findstr "LISTENING"` so we only match the server socket, not Electron's
  // own established connections to that port (which would yield Electron's own PID).
  if (process.platform === 'win32') {
    spawnSync('cmd', ['/c',
      `for /f "tokens=5" %a in ('netstat -ano ^| findstr ":${SIM_PORT}" ^| findstr "LISTENING"') do taskkill /F /T /PID %a`,
    ], { encoding: 'utf-8' })
  } else {
    spawnSync('sh', ['-c', `lsof -ti:${SIM_PORT} | xargs -r kill -9`], { encoding: 'utf-8' })
  }

  // Confirm the port is actually free before spawning.
  const portFree = await waitForPortFree()
  if (!portFree) {
    return { ok: false, error: `Port ${SIM_PORT} is still in use after kill attempt. Close any lingering simulation processes and try again.` }
  }

  const isClaudevergence = requestedSimType === 'claudevergence'
  const translatorScript = isClaudevergence ? CV2_TRANSLATOR_SCRIPT : CV_TRANSLATOR_SCRIPT
  const mapExt           = isClaudevergence ? '.cvmap.json' : '.cmap.json'
  const simDir           = isClaudevergence ? CLAUDEVERGENCE_DIR : CLASHVERGENCE_DIR
  const mapFileArg       = resolvedMapPath.endsWith('.wwmap')
    ? resolvedMapPath.replace(/\.wwmap$/, mapExt)
    : resolvedMapPath + mapExt

  const xResult = spawnSync(PYTHON_CMD, [translatorScript, resolvedMapPath, mapFileArg, String(numFactions)], { encoding: 'utf-8' })
  if (xResult.status !== 0) {
    return { ok: false, error: xResult.stderr?.trim() || xResult.error?.message || 'Translator failed.' }
  }

  const stderrChunks: Buffer[] = []
  simProcess = spawn(
    PYTHON_CMD,
    [join(simDir, 'main.py'), '--map-file', mapFileArg, '--game-server', '--port', String(SIM_PORT)],
    { cwd: simDir },
  )
  simPid = simProcess.pid
  simProcess.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

  try {
    await waitForServer()
    return { ok: true }
  } catch (e: any) {
    const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim()
    killSimProcess()
    return { ok: false, error: stderr || e.message }
  }
}

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

async function waitForServer(maxMs = 60_000): Promise<void> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try { await simGet('/api/health'); return } catch { /* not ready yet */ }
    await new Promise<void>((r) => setTimeout(r, 250))
  }
  throw new Error('Clashvergence server did not start within 60 s.')
}

// ── Simulation IPC ────────────────────────────────────────────────────────────

function _resolveMapPath(mapFilePath: string): string | null {
  if (mapFilePath.startsWith('__example__')) {
    const exId = mapFilePath.slice('__example__'.length)
    const ex = BUNDLED_EXAMPLES.find(e => e.id === exId)
    return ex ? join(EXAMPLES_DIR, ex.filename) : null
  }
  return mapFilePath
}

ipcMain.handle('sim:start', async (_, mapFilePath: string, numFactions: number = 4, requestedSimType: string = 'clashvergence') => {
  const resolvedPath = _resolveMapPath(mapFilePath)
  if (!resolvedPath) return { ok: false, error: `Unknown example: ${mapFilePath}` }

  const spawn_result = await _spawnServer(resolvedPath, numFactions, requestedSimType)
  if (!spawn_result.ok) return spawn_result

  simMapPath = mapFilePath
  simNumFactions = numFactions
  simType = requestedSimType

  try {
    const raw = await simGet('/api/world')
    return { ok: true, world: JSON.parse(raw) }
  } catch (e: any) {
    killSimProcess()
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('sim:save-state', async () => {
  if (!simProcess) return { ok: false, error: 'No simulation running.' }
  try {
    const worldRaw = await simGet('/api/save')
    const result = await dialog.showSaveDialog({
      title: 'Save Simulation',
      defaultPath: 'simulation.wwsim',
      filters: [{ name: 'World Builder Simulation', extensions: ['wwsim'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    const envelope = {
      worldwright_save: true,
      sim_type: simType,
      map_path: simMapPath,
      num_factions: simNumFactions,
      world_state: JSON.parse(worldRaw),
    }
    writeFileSync(result.filePath, JSON.stringify(envelope, null, 2), 'utf-8')
    return { ok: true, filePath: result.filePath }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('sim:load-and-start', async () => {
  const pickResult = await dialog.showOpenDialog({
    title: 'Load Simulation',
    filters: [{ name: 'World Builder Simulation', extensions: ['wwsim'] }],
    properties: ['openFile'],
  })
  if (pickResult.canceled || !pickResult.filePaths.length) return { canceled: true }

  let envelope: any
  try {
    envelope = JSON.parse(readFileSync(pickResult.filePaths[0], 'utf-8'))
  } catch {
    return { ok: false, error: 'Could not read save file.' }
  }
  if (!envelope.worldwright_save) return { ok: false, error: 'Invalid save file format.' }

  const mapPath = envelope.map_path as string
  const numFactions = Number(envelope.num_factions ?? 4)
  const savedSimType: string = envelope.sim_type ?? 'clashvergence'
  const worldState = envelope.world_state

  const resolvedPath = _resolveMapPath(mapPath)
  if (!resolvedPath) return { ok: false, error: `Save file references unknown map: ${mapPath}` }

  const spawn_result = await _spawnServer(resolvedPath, numFactions, savedSimType)
  if (!spawn_result.ok) return spawn_result

  simMapPath = mapPath
  simNumFactions = numFactions
  simType = savedSimType

  try {
    const loadRaw = await simPost('/api/load', worldState)
    const loadResult = JSON.parse(loadRaw)
    if (!loadResult.ok) {
      killSimProcess()
      return { ok: false, error: loadResult.error ?? 'Server rejected save state.' }
    }
    return { ok: true, world: loadResult }
  } catch (e: any) {
    killSimProcess()
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('sim:stop', () => {
  killSimProcess()
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
  killSimProcess()
})
