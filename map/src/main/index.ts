import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { basename, dirname, extname, join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
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

const ICON_PATH = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(app.getAppPath(), 'resources', 'icon.png')

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'World Builder',
    icon: existsSync(ICON_PATH) ? ICON_PATH : undefined,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => { win.show(); win.maximize() })

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
      defaultPath: 'my-world.azmap',
      filters: [{ name: 'World Builder Map', extensions: ['azmap', 'wwmap'] }],
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

ipcMain.handle('lore:load-by-path', async (_, path: string) => {
  try {
    const data = readFileSync(path, 'utf-8')
    return { canceled: false, data, filePath: path }
  } catch {
    return { canceled: true, error: 'File not found or unreadable.' }
  }
})

ipcMain.handle('lore:load', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open Lore File',
    filters: [{ name: 'Azhora Lore', extensions: ['azlore'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  try {
    const data = readFileSync(result.filePaths[0], 'utf-8')
    return { canceled: false, data, filePath: result.filePaths[0] }
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
    const filePath = join(EXAMPLES_DIR, ex.filename)
    const raw = readFileSync(filePath, 'utf-8')
    return { data: raw, filePath }
  } catch {
    return { canceled: true, error: 'Example file not found.' }
  }
})

ipcMain.handle('map:save-story', async (_, jsonData: string, worldName: string) => {
  const safe = (worldName ?? 'story-world').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().slice(0, 64) || 'story-world'
  const dir = join(app.getPath('userData'), 'story-worlds')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `${safe}-${Date.now()}.wwmap`)
  writeFileSync(filePath, jsonData, 'utf-8')
  return { filePath }
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
let simNumFactions: number = 9
let simType: string = 'clashvergence'
let simSeed: string | null = null

function _generatedMapPathFor(sourcePath: string, mapExt: string): string {
  const dir = dirname(sourcePath)
  let name = basename(sourcePath)
  for (const suffix of ['.cmap.json', '.cvmap.json', '.azmap', '.wwmap', '.json']) {
    if (name.toLowerCase().endsWith(suffix)) {
      name = name.slice(0, -suffix.length)
      return join(dir, `${name}${mapExt}`)
    }
  }
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  return join(dir, `${stem}${mapExt}`)
}

function _processText(value: unknown): string {
  if (value == null) return ''
  return Buffer.isBuffer(value) ? value.toString('utf-8') : String(value)
}

function _formatProcessOutput(label: string, stdout?: unknown, stderr?: unknown): string[] {
  const lines: string[] = []
  const cleanStdout = _processText(stdout).trim()
  const cleanStderr = _processText(stderr).trim()
  if (cleanStdout) lines.push(`${label} stdout:\n${cleanStdout}`)
  if (cleanStderr) lines.push(`${label} stderr:\n${cleanStderr}`)
  return lines
}

function _formatTranslatorFailure(result: ReturnType<typeof spawnSync>, translatorScript: string, inputPath: string, outputPath: string): string {
  const parts = [
    'Map translation failed.',
    `Translator: ${translatorScript}`,
    `Input: ${inputPath}`,
    `Output: ${outputPath}`,
  ]
  if (result.error?.message) parts.push(`Process error: ${result.error.message}`)
  parts.push(..._formatProcessOutput('Translator', result.stdout, result.stderr))
  return parts.join('\n\n')
}

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
  requestedSeed: string | null = null,
): Promise<{ ok: boolean; error?: string; generatedMapPath?: string }> {
  killSimProcess()

  // Kill any process LISTENING on our port (orphan from a crashed previous session).
  // PowerShell is more reliable than cmd/netstat/taskkill for this on Windows 10.
  if (process.platform === 'win32') {
    spawnSync('powershell', [
      '-NonInteractive', '-Command',
      `Get-NetTCPConnection -LocalPort ${SIM_PORT} -State Listen -ErrorAction SilentlyContinue` +
      ` | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ], { encoding: 'utf-8' })
  } else {
    spawnSync('sh', ['-c', `lsof -ti:${SIM_PORT} | xargs -r kill -9`], { encoding: 'utf-8' })
  }

  // Give the OS a moment to release the socket, then confirm the port is free.
  await new Promise<void>((r) => setTimeout(r, 400))
  const portFree = await waitForPortFree(10_000)
  if (!portFree) {
    return { ok: false, error: `Port ${SIM_PORT} is still in use. Open Task Manager and end any python.exe processes, then try again.` }
  }

  const isClaudevergence = requestedSimType === 'claudevergence'
  const translatorScript = isClaudevergence ? CV2_TRANSLATOR_SCRIPT : CV_TRANSLATOR_SCRIPT
  const mapExt           = isClaudevergence ? '.cvmap.json' : '.cmap.json'
  const simDir           = isClaudevergence ? CLAUDEVERGENCE_DIR : CLASHVERGENCE_DIR
  const mapFileArg       = _generatedMapPathFor(resolvedMapPath, mapExt)
  const normalizedSeed   = (requestedSeed ?? '').trim()

  if (!existsSync(translatorScript)) {
    return { ok: false, error: `Translator script not found:\n${translatorScript}` }
  }
  if (!existsSync(simDir)) {
    return { ok: false, error: `Simulation project directory not found:\n${simDir}` }
  }

  const xResult = spawnSync(PYTHON_CMD, [translatorScript, resolvedMapPath, mapFileArg, String(numFactions)], { encoding: 'utf-8' })
  if (xResult.status !== 0) {
    return { ok: false, error: _formatTranslatorFailure(xResult, translatorScript, resolvedMapPath, mapFileArg) }
  }

  const stderrChunks: Buffer[] = []
  const serverModeArg = isClaudevergence ? '--game-server' : '--observer-server'
  const simArgs = [join(simDir, 'main.py'), '--map-file', mapFileArg, serverModeArg, '--port', String(SIM_PORT)]
  if (normalizedSeed) {
    simArgs.push('--seed', normalizedSeed)
  }
  simProcess = spawn(
    PYTHON_CMD,
    simArgs,
    { cwd: simDir },
  )
  simPid = simProcess.pid
  simProcess.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

  try {
    await waitForServer()
    return { ok: true, generatedMapPath: mapFileArg }
  } catch (e: any) {
    const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim()
    const details = [
      `${isClaudevergence ? 'Claudevergence' : 'Clashvergence'} server did not start.`,
      `Command: ${PYTHON_CMD} ${simArgs.join(' ')}`,
      `Generated map: ${mapFileArg}`,
      ..._formatProcessOutput('Translator', xResult.stdout, xResult.stderr),
      stderr ? `Server stderr:\n${stderr}` : '',
      e.message ? `Startup error:\n${e.message}` : '',
    ].filter(Boolean)
    killSimProcess()
    return { ok: false, error: details.join('\n\n') }
  }
}

function collectResponse(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    res.on('error', reject)
  })
}

function simGet(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${SIM_PORT}${path}`, (res) =>
      collectResponse(res).then(resolve, reject)
    )
    req.on('error', reject)
  })
}

function simPost(path: string, body: object): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = http.request(
      { hostname: '127.0.0.1', port: SIM_PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => collectResponse(res).then(resolve, reject),
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

ipcMain.handle('sim:start', async (_, mapFilePath: string, numFactions: number = 9, requestedSimType: string = 'clashvergence', requestedSeed: string = '') => {
  const resolvedPath = _resolveMapPath(mapFilePath)
  if (!resolvedPath) return { ok: false, error: `Unknown example: ${mapFilePath}` }

  const normalizedSeed = requestedSeed.trim()
  const spawn_result = await _spawnServer(resolvedPath, numFactions, requestedSimType, normalizedSeed)
  if (!spawn_result.ok) return spawn_result

  simMapPath = mapFilePath
  simNumFactions = numFactions
  simType = requestedSimType
  simSeed = normalizedSeed || null

  try {
    const raw = await simGet('/api/world')
    return {
      ok: true,
      world: JSON.parse(raw),
      seed: simSeed ?? '',
      generatedMapPath: spawn_result.generatedMapPath,
    }
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
      sim_seed: simSeed,
      map_path: simMapPath,
      generated_map_path: _generatedMapPathFor(
        _resolveMapPath(simMapPath ?? '') ?? '',
        simType === 'claudevergence' ? '.cvmap.json' : '.cmap.json',
      ),
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
  const numFactions = Number(envelope.num_factions ?? 9)
  const savedSimType: string = envelope.sim_type ?? 'clashvergence'
  const savedSeed: string = envelope.sim_seed ?? envelope.world_state?.random_seed ?? ''
  const worldState = envelope.world_state

  const resolvedPath = _resolveMapPath(mapPath)
  if (!resolvedPath) return { ok: false, error: `Save file references unknown map: ${mapPath}` }

  const spawn_result = await _spawnServer(resolvedPath, numFactions, savedSimType, savedSeed)
  if (!spawn_result.ok) return spawn_result

  simMapPath = mapPath
  simNumFactions = numFactions
  simType = savedSimType
  simSeed = savedSeed.trim() || null

  try {
    const loadRaw = await simPost('/api/load', worldState)
    const loadResult = JSON.parse(loadRaw)
    if (!loadResult.ok) {
      killSimProcess()
      return { ok: false, error: loadResult.error ?? 'Server rejected save state.' }
    }
    return {
      ok: true,
      world: loadResult,
      seed: simSeed ?? '',
      generatedMapPath: spawn_result.generatedMapPath,
    }
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
    if (simType === 'clashvergence') {
      await simPost('/api/advance', {})
    } else {
      const stateRaw = await simGet('/api/state')
      const state = JSON.parse(stateRaw)
      const actions: Array<{ action_id: string }> = state.state?.available_actions ?? []
      const actionId = actions[0]?.action_id ?? 'hold'
      await simPost('/api/action', { action_id: actionId })
    }
    return JSON.parse(await simGet('/api/world'))
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
})

app.on('before-quit', () => {
  killSimProcess()
})
