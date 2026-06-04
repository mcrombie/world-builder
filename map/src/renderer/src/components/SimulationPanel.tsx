import { useMemo, useState, useRef, useEffect } from 'react'
import { useMapStore } from '../store/mapStore'
import { IS_BROWSER } from '../lib/fileIO'
import type { SimFaction, ViewMode } from '../types/map'

const SIM_PANEL_WIDTH: Record<ViewMode, string> = {
  map:      'w-56',
  balanced: 'w-72',
  panel:    'w-80',
  lore:     'w-64',
}

const FACTION_PALETTE = [
  '#e74c3c', '#3498db', '#2ecc71', '#e67e22',
  '#9b59b6', '#1abc9c', '#f1c40f', '#e91e63',
]

export function buildFactionColorMap(factions: { name: string }[]): Record<string, string> {
  const map: Record<string, string> = {}
  factions.forEach((f, i) => { map[f.name] = FACTION_PALETTE[i % FACTION_PALETTE.length] })
  return map
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(0)}k`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function fmtTreasury(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `$${(n / 1_000).toFixed(0)}k`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

function fmtEventType(type: string): string {
  const labels: Record<string, string> = {
    expand: 'Expand', attack: 'Attack', develop: 'Develop',
    shock_climate_anomaly: 'Climate', technology_adoption: 'Tech',
    technology_institutionalized: 'Tech', rebellion: 'Rebellion',
    migration: 'Migration', diplomacy: 'Diplomacy',
  }
  return labels[type] ?? type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

interface SimEvent { type: string; faction?: string; region?: string; turn?: number }

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function SimulationPanel() {
  const simWorld       = useMapStore((s) => s.simWorld)
  const setSimWorld    = useMapStore((s) => s.setSimWorld)
  const setSimulating  = useMapStore((s) => s.setSimulating)
  const currentFilePath = useMapStore((s) => s.currentFilePath)
  const simFactionCount = useMapStore((s) => s.simFactionCount)
  const simType         = useMapStore((s) => s.simType)
  const simSeed         = useMapStore((s) => s.simSeed)
  const simGeneratedMapPath = useMapStore((s) => s.simGeneratedMapPath)
  const setSimGeneratedMapPath = useMapStore((s) => s.setSimGeneratedMapPath)
  const viewMode       = useMapStore((s) => s.viewMode)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const playRef = useRef(false)

  const factionColors = useMemo(
    () => buildFactionColorMap(simWorld?.factions ?? []),
    [simWorld?.factions],
  )

  const factionDisplayMap = useMemo(() => {
    const map: Record<string, string> = {}
    simWorld?.factions.forEach(f => { map[f.name] = f.display_name })
    return map
  }, [simWorld?.factions])

  const rankedFactions: SimFaction[] = useMemo(() =>
    simWorld ? [...simWorld.factions].sort(
      (a, b) => b.owned_regions - a.owned_regions || b.treasury - a.treasury
    ) : [],
    [simWorld?.factions],
  )

  async function advanceOnce(): Promise<boolean> {
    if (IS_BROWSER || !window.electronAPI?.sim) return false
    try {
      const result = await window.electronAPI.sim.advance()
      if (result.ok === false) {
        setError((result as any).error ?? 'Failed to advance turn.')
        return false
      }
      setSimWorld(result as any)
      return true
    } catch (e: any) {
      setError(e.message)
      return false
    }
  }

  async function handleAdvance() {
    setIsAdvancing(true)
    setError(null)
    await advanceOnce()
    setIsAdvancing(false)
  }

  function handleTogglePlay() {
    if (isPlaying) {
      playRef.current = false
      setIsPlaying(false)
    } else {
      playRef.current = true
      setIsPlaying(true)
    }
  }

  useEffect(() => {
    if (!isPlaying) return
    let cancelled = false
    async function loop() {
      while (playRef.current && !cancelled) {
        const ok = await advanceOnce()
        if (!ok) { playRef.current = false; setIsPlaying(false); break }
        await new Promise<void>((r) => setTimeout(r, 800))
      }
    }
    loop()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying])

  async function handleStop() {
    playRef.current = false
    setIsPlaying(false)
    if (!window.electronAPI?.sim) return
    await window.electronAPI.sim.stop()
    setSimulating(false)
    setSimWorld(null)
    setSimGeneratedMapPath('')
  }

  async function handleReset() {
    if (IS_BROWSER || !window.electronAPI?.sim || !currentFilePath) return
    playRef.current = false
    setIsPlaying(false)
    setIsAdvancing(true)
    setError(null)
    // sim.start already kills the existing process — no need to stop first
    const result = await window.electronAPI.sim.start(currentFilePath, simFactionCount, simType, simSeed)
    if (!result.ok) {
      setError(result.error ?? 'Failed to restart simulation.')
    } else if (result.world) {
      setSimWorld(result.world as any)
      setSimGeneratedMapPath(result.generatedMapPath ?? '')
    }
    setIsAdvancing(false)
  }

  async function handleSave() {
    if (IS_BROWSER || !window.electronAPI?.sim) return
    const result = await window.electronAPI.sim.saveState()
    if (result.ok === false) setError(result.error ?? 'Save failed.')
  }

  const recentEvents = useMemo(() =>
    ((simWorld?.recent_events ?? []) as SimEvent[]).slice(-10).reverse(),
    [simWorld?.recent_events],
  )

  return (
    <aside className={`${SIM_PANEL_WIDTH[viewMode]} bg-gray-900 text-gray-100 flex flex-col shrink-0 overflow-hidden border-l border-gray-800`}>

      {/* Header */}
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Simulation</div>
        {simWorld && (
          <>
            <div className="text-sm font-bold text-indigo-300 mt-0.5">{simWorld.turn_label}</div>
            {simSeed && (
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">Seed: {simSeed}</div>
            )}
            {simGeneratedMapPath && (
              <div className="text-[11px] text-gray-500 mt-0.5 truncate" title={simGeneratedMapPath}>
                Map: {fileName(simGeneratedMapPath)}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-0">

        {simWorld ? (
          <>
            {/* Faction standings */}
            <div className="px-3 py-2 border-b border-gray-800">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Standings</div>
              <div className="flex flex-col gap-2">
                {rankedFactions.map((f, i) => (
                  <div key={f.name} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-4 shrink-0 tabular-nums">#{i + 1}</span>
                      <span
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ background: factionColors[f.name] }}
                      />
                      <span className="text-sm font-medium text-gray-100 truncate flex-1">{f.display_name}</span>
                    </div>
                    <div className="flex items-center gap-3 pl-6 text-xs text-gray-400">
                      <span title="Regions">
                        <span className="text-gray-300">{f.owned_regions}</span> reg
                      </span>
                      <span title="Population">
                        <span className="text-gray-300">{fmtNum(f.population)}</span> pop
                      </span>
                      <span title="Treasury" className="text-gray-300">{fmtTreasury(f.treasury)}</span>
                    </div>
                    {f.doctrine_label && (
                      <div className="pl-6 text-xs text-gray-600 italic truncate">{f.doctrine_label}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Recent events */}
            {recentEvents.length > 0 && (
              <div className="px-3 py-2 flex-1 min-h-0">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Recent Events</div>
                <div className="flex flex-col gap-1 overflow-y-auto max-h-48">
                  {recentEvents.map((ev, i) => {
                    const factionName = ev.faction ? (factionDisplayMap[ev.faction] ?? ev.faction) : null
                    const color = ev.faction ? factionColors[ev.faction] : undefined
                    return (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        {color && (
                          <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ background: color }} />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-gray-300 font-medium">{fmtEventType(ev.type ?? '')}</span>
                          {factionName && <span className="text-gray-500 truncate">{factionName}</span>}
                          {ev.region && <span className="text-gray-600 truncate">→ {ev.region}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-gray-500 italic">Starting simulation…</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-3 py-3 border-t border-gray-800 flex flex-col gap-2">
        {error && <p className="text-xs text-red-400">{error}</p>}
        {simWorld && (
          <div className="flex gap-2">
            <button
              className="flex-1 px-3 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-wait"
              onClick={handleAdvance}
              disabled={isAdvancing || isPlaying}
            >
              {isAdvancing ? 'Advancing…' : 'Next Turn'}
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded font-mono ${isPlaying ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-green-700 hover:bg-green-600'} disabled:opacity-40`}
              onClick={handleTogglePlay}
              disabled={isAdvancing}
              title={isPlaying ? 'Pause' : 'Auto-advance'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <button
            className="flex-1 px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40"
            onClick={handleSave}
            disabled={isAdvancing || !simWorld}
            title="Save simulation state to file"
          >
            Save
          </button>
          <button
            className="flex-1 px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40"
            onClick={handleReset}
            disabled={isAdvancing}
            title="Restart simulation from turn 1"
          >
            Reset
          </button>
          <button
            className="flex-1 px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600"
            onClick={handleStop}
          >
            Stop
          </button>
        </div>
      </div>
    </aside>
  )
}
