import { useState } from 'react'
import { useMapStore } from '../store/mapStore'
import { IS_BROWSER } from '../lib/fileIO'

export const SIM_FACTION_COLORS: Record<string, string> = {
  Faction1: '#e74c3c',
  Faction2: '#3498db',
  Faction3: '#2ecc71',
  Faction4: '#e67e22',
  Faction5: '#9b59b6',
  Faction6: '#1abc9c',
  Faction7: '#f1c40f',
  Faction8: '#e91e63',
}

export function SimulationPanel() {
  const simWorld      = useMapStore((s) => s.simWorld)
  const setSimWorld   = useMapStore((s) => s.setSimWorld)
  const setSimulating = useMapStore((s) => s.setSimulating)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [error, setError]             = useState<string | null>(null)

  async function handleAdvance() {
    if (IS_BROWSER || !window.electronAPI?.sim) return
    setIsAdvancing(true)
    setError(null)
    try {
      const result = await window.electronAPI.sim.advance()
      if (result.ok === false) {
        setError((result as any).error ?? 'Failed to advance turn.')
      } else {
        setSimWorld(result as any)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsAdvancing(false)
    }
  }

  async function handleStop() {
    if (!window.electronAPI?.sim) return
    await window.electronAPI.sim.stop()
    setSimulating(false)
    setSimWorld(null)
  }

  return (
    <aside className="w-60 bg-gray-900 text-gray-100 p-4 flex flex-col gap-3 shrink-0 overflow-y-auto">
      <h2 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-2">
        Simulation
      </h2>

      {simWorld ? (
        <>
          <p className="text-xs text-indigo-400 font-mono">{simWorld.turn_label}</p>

          <div className="flex flex-col gap-1.5">
            {simWorld.factions.map((f) => (
              <div key={f.name} className="flex items-center gap-2 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: SIM_FACTION_COLORS[f.name] ?? '#888' }}
                />
                <span className="text-gray-200 truncate flex-1">{f.display_name}</span>
                <span className="text-gray-500 shrink-0 tabular-nums">{f.owned_regions}r</span>
                <span className="text-gray-500 shrink-0 tabular-nums">${f.treasury}</span>
              </div>
            ))}
          </div>

          {simWorld.recent_events.length > 0 && (
            <div className="border-t border-gray-700 pt-2">
              <p className="text-xs text-gray-500 mb-1">Recent events</p>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                {(simWorld.recent_events as any[]).slice(-6).reverse().map((ev, i) => (
                  <p key={i} className="text-xs text-gray-400 leading-snug">
                    {ev.type ?? String(ev)}
                    {ev.region ? ` · ${ev.region}` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            className="px-3 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-wait mt-auto"
            onClick={handleAdvance}
            disabled={isAdvancing}
          >
            {isAdvancing ? 'Advancing…' : 'Next Turn'}
          </button>
        </>
      ) : (
        <p className="text-xs text-gray-500 italic">Starting simulation…</p>
      )}

      <button
        className="px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600"
        onClick={handleStop}
      >
        Stop
      </button>
    </aside>
  )
}
