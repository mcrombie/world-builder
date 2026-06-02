import { useState, useEffect, useRef } from 'react'
import { HexCanvas } from './components/HexCanvas'
import { Toolbar } from './components/Toolbar'
import { InfoPanel } from './components/InfoPanel'
import { NewMapDialog } from './components/NewMapDialog'
import { RandomMapDialog } from './components/RandomMapDialog'
import { ResizeDialog } from './components/ResizeDialog'
import { MapLibraryDialog } from './components/MapLibraryDialog'
import { ExampleMapsDialog } from './components/ExampleMapsDialog'
import { SimulationPanel } from './components/SimulationPanel'
import { SimulateDialog } from './components/SimulateDialog'
import { StoryView } from './components/StoryView'
import { useMapStore } from './store/mapStore'
import { fileIO, IS_BROWSER, type RecentFile } from './lib/fileIO'
import { autoSave, loadAutoSave, saveToLibrary } from './lib/mapLibrary'
import type { MapData, SimWorldState } from './types/map'

type AppMode = 'editor' | 'generate' | 'story'

const APP_TABS: { id: AppMode; label: string }[] = [
  { id: 'editor',   label: 'Editor'     },
  { id: 'generate', label: 'Generate'   },
  { id: 'story',    label: 'Story Mode' },
]

export default function App() {
  const [appMode,              setAppMode]             = useState<AppMode>('editor')
  const [showNewDialog,        setShowNewDialog]       = useState(false)
  const [showRandomDialog,    setShowRandomDialog]    = useState(false)
  const [showResizeDialog,    setShowResizeDialog]    = useState(false)
  const [showLibraryDialog,   setShowLibraryDialog]   = useState(false)
  const [showExamplesDialog,  setShowExamplesDialog]  = useState(false)
  const [showSimulateDialog,  setShowSimulateDialog]  = useState(false)
  const [recentFiles,        setRecentFiles]        = useState<RecentFile[] | undefined>(undefined)

  const map           = useMapStore((s) => s.map)
  const isDirty       = useMapStore((s) => s.isDirty)
  const currentPath   = useMapStore((s) => s.currentFilePath)
  const history       = useMapStore((s) => s.history)
  const storeLoad     = useMapStore((s) => s.loadMap)
  const markSaved     = useMapStore((s) => s.markSaved)
  const undo          = useMapStore((s) => s.undo)
  const isSimulating     = useMapStore((s) => s.isSimulating)
  const setSimulating    = useMapStore((s) => s.setSimulating)
  const setSimWorld      = useMapStore((s) => s.setSimWorld)
  const simFactionCount  = useMapStore((s) => s.simFactionCount)
  const setSimFactionCount = useMapStore((s) => s.setSimFactionCount)
  const simType          = useMapStore((s) => s.simType)
  const setSimType       = useMapStore((s) => s.setSimType)
  const simSeed          = useMapStore((s) => s.simSeed)
  const setSimSeed       = useMapStore((s) => s.setSimSeed)
  const viewMode         = useMapStore((s) => s.viewMode)
  const setViewMode      = useMapStore((s) => s.setViewMode)

  // ── Restore autosave on mount (browser only) ──────────────────────────────
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!IS_BROWSER || restoredRef.current) return
    restoredRef.current = true
    if (useMapStore.getState().map) return
    const raw = loadAutoSave()
    if (!raw) return
    try { storeLoad(JSON.parse(raw) as MapData, '__autosave__') } catch {}
  }, [storeLoad])

  // ── Auto-save on blur / beforeunload (browser only) ──────────────────────
  useEffect(() => {
    if (!IS_BROWSER) return
    function save() {
      const m = useMapStore.getState().map
      if (m) autoSave(JSON.stringify(m))
    }
    window.addEventListener('blur', save)
    window.addEventListener('beforeunload', save)
    return () => {
      window.removeEventListener('blur', save)
      window.removeEventListener('beforeunload', save)
    }
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, map, currentPath])

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!map) return
    if (IS_BROWSER) {
      const existingId = currentPath && !currentPath.startsWith('__') ? currentPath : undefined
      const id = saveToLibrary(map, existingId)
      markSaved(id)
    } else {
      const json = JSON.stringify(map, null, 2)
      const result = await fileIO.saveMap(json, currentPath ?? undefined)
      if (!result.canceled && result.filePath) {
        markSaved(result.filePath)
        await fileIO.addRecent(result.filePath, map.name)
      }
    }
  }

  // ── Export to file (browser only) ─────────────────────────────────────────
  async function handleExport() {
    if (!map) return
    await fileIO.saveMap(JSON.stringify(map, null, 2), map.name)
  }

  // ── Open / library ────────────────────────────────────────────────────────
  async function handleOpen() {
    if (IS_BROWSER) {
      setShowLibraryDialog(true)
    } else {
      const recent = await fileIO.listRecent()
      setRecentFiles(recent)
      setShowLibraryDialog(true)
    }
  }

  function handleLibraryLoad(data: MapData, id: string) {
    storeLoad(data, id)
    if (!IS_BROWSER) fileIO.addRecent(id, data.name)
    setShowLibraryDialog(false)
  }

  async function handleBrowse() {
    setShowLibraryDialog(false)
    const result = await fileIO.loadMap()
    if (!result.canceled && result.data && result.filePath) {
      try {
        const data = JSON.parse(result.data) as MapData
        storeLoad(data, result.filePath)
        await fileIO.addRecent(result.filePath, data.name)
      } catch {
        alert('Failed to parse map file.')
      }
    }
  }

  // ── Simulation ────────────────────────────────────────────────────────────
  async function handleSimulate() {
    if (!map || IS_BROWSER || !window.electronAPI?.sim) return
    if (isSimulating) {
      await window.electronAPI.sim.stop()
      setSimulating(false)
      setSimWorld(null)
      return
    }
    if (!currentPath) {
      alert('Load or save a map before starting a simulation.')
      return
    }
    setShowSimulateDialog(true)
  }

  async function handleStartNew(factionCount: number, selectedSimType: 'clashvergence' | 'claudevergence', seed: string) {
    setShowSimulateDialog(false)
    if (!currentPath || !window.electronAPI?.sim) return
    const normalizedSeed = seed.trim()
    setSimFactionCount(factionCount)
    setSimType(selectedSimType)
    setSimSeed(normalizedSeed)
    setSimulating(true)
    const result = await window.electronAPI.sim.start(currentPath, factionCount, selectedSimType, normalizedSeed)
    if (!result.ok) {
      alert('Simulation failed to start:\n' + (result.error ?? 'Unknown error'))
      setSimulating(false)
    } else if (result.world) {
      setSimWorld(result.world as SimWorldState)
    }
  }

  async function handleLoadSaved() {
    setShowSimulateDialog(false)
    if (!window.electronAPI?.sim) return
    setSimulating(true)
    const result = await window.electronAPI.sim.loadAndStart()
    if (result.canceled) {
      setSimulating(false)
      return
    }
    if (!result.ok) {
      alert('Failed to load simulation:\n' + (result.error ?? 'Unknown error'))
      setSimulating(false)
    } else if (result.world) {
      setSimSeed(result.seed ?? '')
      setSimWorld(result.world as SimWorldState)
    }
  }

  // ── Status display ────────────────────────────────────────────────────────
  const saveStatus = IS_BROWSER
    ? (isDirty ? 'Unsaved changes' : currentPath ? 'Saved' : '')
    : (currentPath ?? (map ? 'Unsaved' : ''))

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 select-none">

      {/* ── Menu bar ── */}
      <header className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="font-semibold text-indigo-400 mr-1">World Builder</span>

        {/* App mode tabs */}
        <div className="flex gap-0.5 bg-gray-800 rounded p-0.5 mr-2">
          {APP_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setAppMode(id)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                appMode === id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Editor-only controls */}
        {appMode === 'editor' && (<>
        <button className="px-3 py-1 text-sm rounded hover:bg-gray-700" onClick={() => setShowNewDialog(true)}>
          New
        </button>
        <button className="px-3 py-1 text-sm rounded hover:bg-gray-700" onClick={() => setShowExamplesDialog(true)}>
          Maps
        </button>
        <button className="px-3 py-1 text-sm rounded hover:bg-gray-700" onClick={handleOpen}>
          Open
        </button>
        <button
          className={`px-3 py-1 text-sm rounded ${isDirty ? 'hover:bg-gray-700' : 'opacity-40 cursor-default'}`}
          onClick={handleSave}
          disabled={!isDirty}
        >
          Save{isDirty ? ' *' : ''}
        </button>
        {IS_BROWSER && (
          <button
            className={`px-3 py-1 text-sm rounded ${map ? 'hover:bg-gray-700' : 'opacity-40 cursor-default'}`}
            onClick={handleExport}
            disabled={!map}
            title="Download as .wwmap file"
          >
            Export
          </button>
        )}
        <button
          className={`px-3 py-1 text-sm rounded ${map ? 'hover:bg-gray-700' : 'opacity-40 cursor-default'}`}
          onClick={() => setShowResizeDialog(true)}
          disabled={!map}
        >
          Resize
        </button>
        <button
          className={`px-3 py-1 text-sm rounded ${history.length > 0 ? 'hover:bg-gray-700' : 'opacity-40 cursor-default'}`}
          onClick={undo}
          disabled={history.length === 0}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>

        {!IS_BROWSER && (
          <button
            className={`px-3 py-1 text-sm rounded ${isSimulating ? 'bg-indigo-700 text-white hover:bg-indigo-600' : map && currentPath ? 'hover:bg-gray-700' : 'opacity-40 cursor-default'}`}
            onClick={handleSimulate}
            disabled={!map || !currentPath}
            title={isSimulating ? 'Stop simulation' : !map ? 'Load a map first' : !currentPath ? 'Load or save a map first' : 'Run Clashvergence simulation'}
          >
            {isSimulating ? 'Simulating…' : 'Simulate'}
          </button>
        )}

        {/* View mode toggle */}
        <div className="ml-auto flex items-center gap-0.5 bg-gray-800 rounded p-0.5">
          {([
            {
              id: 'map',      title: 'Map focused',
              icon: <svg width="20" height="12" viewBox="0 0 20 12" fill="currentColor">
                <rect x="0"  y="0" width="12" height="12" rx="1.5" opacity="0.65" />
                <rect x="14" y="0" width="6"  height="12" rx="1.5" />
              </svg>,
            },
            {
              id: 'balanced', title: 'Balanced',
              icon: <svg width="20" height="12" viewBox="0 0 20 12" fill="currentColor">
                <rect x="0"  y="0" width="9" height="12" rx="1.5" opacity="0.65" />
                <rect x="11" y="0" width="9" height="12" rx="1.5" />
              </svg>,
            },
            {
              id: 'panel',    title: 'Panel focused',
              icon: <svg width="20" height="12" viewBox="0 0 20 12" fill="currentColor">
                <rect x="0"  y="0" width="6"  height="12" rx="1.5" opacity="0.65" />
                <rect x="8"  y="0" width="12" height="12" rx="1.5" />
              </svg>,
            },
            {
              id: 'lore',     title: 'Lore reader (50/50)',
              icon: <svg width="20" height="12" viewBox="0 0 20 12" fill="currentColor">
                <rect x="0"  y="0"   width="8" height="12" rx="1.5" opacity="0.65" />
                <rect x="11" y="1"   width="9" height="2"  rx="1" />
                <rect x="11" y="5"   width="9" height="2"  rx="1" />
                <rect x="11" y="9"   width="6" height="2"  rx="1" />
              </svg>,
            },
          ] as const).map(({ id, title, icon }) => (
            <button
              key={id}
              title={title}
              onClick={() => setViewMode(id)}
              className={`flex items-center justify-center px-2 py-1 rounded transition-colors
                ${viewMode === id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
            >
              {icon}
            </button>
          ))}
        </div>

        <span className="text-xs text-gray-500 truncate max-w-xs">{saveStatus}</span>
        {map && <span className="text-xs text-gray-500">{map.width}×{map.height} hexes</span>}
        </>)}
      </header>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden">
        {appMode === 'editor' && (<>
          <Toolbar />
          <main className="flex-1 relative overflow-hidden">
            {map ? (
              <HexCanvas />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                <p className="text-lg">No map loaded</p>
                <div className="flex gap-3">
                  <button
                    className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
                    onClick={() => setShowNewDialog(true)}
                  >
                    New Map
                  </button>
                  <button
                    className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm"
                    onClick={handleOpen}
                  >
                    Open Map
                  </button>
                </div>
              </div>
            )}
          </main>
          {isSimulating ? (
            <>
              <SimulationPanel />
              <InfoPanel />
            </>
          ) : (
            <InfoPanel />
          )}
        </>)}

        {appMode === 'generate' && (
          <div className="flex-1 flex items-start justify-center overflow-y-auto p-8 bg-gray-950">
            <RandomMapDialog inline onClose={() => setAppMode('editor')} />
          </div>
        )}

        {appMode === 'story' && <StoryView />}
      </div>

      {/* ── Status bar ── */}
      <footer className="px-4 py-1 text-xs text-gray-500 bg-gray-900 border-t border-gray-800 shrink-0">
        World Builder &nbsp;|&nbsp; Scroll to zoom · Middle-click or Pan tool to pan · Click to paint
      </footer>

      {showExamplesDialog && (
        <ExampleMapsDialog
          onClose={() => setShowExamplesDialog(false)}
          onLoad={(data, id) => {
            storeLoad(data, id)
            if (!IS_BROWSER && !id.startsWith('__')) fileIO.addRecent(id, data.name)
            setShowExamplesDialog(false)
          }}
        />
      )}
      {showSimulateDialog && (
        <SimulateDialog
          initialFactionCount={simFactionCount}
          initialSimType={simType}
          initialSeed={simSeed}
          isAzhoraMap={
            (map?.name ?? '').toLowerCase().includes('azhora') ||
            (currentPath ?? '').toLowerCase().includes('azhora')
          }
          onStartNew={handleStartNew}
          onLoadSaved={handleLoadSaved}
          onClose={() => setShowSimulateDialog(false)}
        />
      )}
      {showNewDialog     && <NewMapDialog     onClose={() => setShowNewDialog(false)} />}
      {showRandomDialog  && <RandomMapDialog  onClose={() => setShowRandomDialog(false)} />}
      {showResizeDialog  && <ResizeDialog     onClose={() => setShowResizeDialog(false)} />}
      {showLibraryDialog && (
        <MapLibraryDialog
          onClose={() => setShowLibraryDialog(false)}
          onLoad={handleLibraryLoad}
          recentFiles={IS_BROWSER ? undefined : recentFiles}
          onBrowse={IS_BROWSER ? undefined : handleBrowse}
        />
      )}
    </div>
  )
}
