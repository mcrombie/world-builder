import { useMemo, useState, useRef, useEffect } from 'react'
import { useMapStore } from '../store/mapStore'
import { IS_BROWSER } from '../lib/fileIO'
import type { SimActiveShock, SimActiveWar, SimEvent, SimFaction, SimHotRegion, ViewMode } from '../types/map'

const SIM_PANEL_WIDTH: Record<ViewMode, string> = {
  map:      'w-80',
  balanced: 'w-80',
  panel:    'w-96',
  lore:     'w-80',
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
  const sign = n < 0 ? '-' : ''
  const value = Math.abs(n)
  if (value >= 1_000_000) return `${sign}$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000)    return `${sign}$${(value / 1_000).toFixed(0)}k`
  if (value >= 1_000)     return `${sign}$${(value / 1_000).toFixed(1)}k`
  return `${sign}$${Math.round(value)}`
}

function fmtSigned(n: number, digits = 0): string {
  const value = Number.isFinite(n) ? n : 0
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}`
}

function fmtPct(n: number): string {
  const value = Number.isFinite(n) ? n : 0
  return `${Math.round(value * 100)}%`
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function fmtEventType(type: string): string {
  const labels: Record<string, string> = {
    expand: 'Expand', attack: 'Attack', develop: 'Develop',
    shock_climate_anomaly: 'Climate', technology_adoption: 'Tech',
    technology_institutionalized: 'Tech', rebellion: 'Rebellion',
    migration: 'Migration', diplomacy: 'Diplomacy',
    war_declared: 'War Declared', war_peace: 'War Peace',
    diplomacy_pact: 'Pact', diplomacy_rivalry: 'Rivalry',
    diplomacy_tributary: 'Tributary', diplomacy_truce: 'Truce',
    unrest_secession: 'Secession', rebel_independence: 'Independence',
    shock_trade_collapse: 'Trade Collapse',
  }
  return labels[type] ?? type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function SectionTitle({ children }: { children: string }) {
  return <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{children}</div>
}

function MetricTile({ label, value, tone = 'neutral', title }: {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
  title?: string
}) {
  const toneClass = {
    neutral: 'text-gray-100',
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-red-300',
  }[tone]
  return (
    <div className="min-w-0 rounded bg-gray-800/70 px-2 py-1.5" title={title}>
      <div className={`text-sm font-semibold tabular-nums truncate ${toneClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 truncate">{label}</div>
    </div>
  )
}

function MiniBar({ value, tone = 'indigo' }: { value: number; tone?: 'indigo' | 'emerald' | 'amber' | 'red' }) {
  const color = {
    indigo: 'bg-indigo-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    red: 'bg-red-400',
  }[tone]
  return (
    <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(clamp01(value) * 100)}%` }} />
    </div>
  )
}

function eventDetail(ev: SimEvent): string {
  const details = ev.details ?? {}
  const impact = ev.impact ?? {}
  const bits: string[] = []
  const amount = details.amount ?? details.invest_amount ?? details.development_amount
  const target = details.target_faction ?? details.defender ?? details.partner
  const status = details.status ?? details.relationship ?? details.peace_term
  const shock = details.kind ?? details.shock_kind
  const treasury = impact.treasury_after ?? details.treasury_after
  if (target) bits.push(String(target))
  if (status) bits.push(String(status))
  if (shock) bits.push(String(shock))
  if (typeof amount === 'number') bits.push(`amount ${fmtSigned(amount, 1)}`)
  if (typeof treasury === 'number') bits.push(`treasury ${fmtTreasury(treasury)}`)
  return bits.slice(0, 2).join(' | ')
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
  const simDetailSelection = useMapStore((s) => s.simDetailSelection)
  const setSimDetailSelection = useMapStore((s) => s.setSimDetailSelection)
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

  const treasuryLeader = useMemo(() =>
    rankedFactions.length
      ? [...rankedFactions].sort((a, b) => b.treasury - a.treasury)[0]
      : null,
    [rankedFactions],
  )

  const hotRegions: SimHotRegion[] = useMemo(() =>
    ((simWorld?.hot_regions ?? []) as SimHotRegion[]).slice(0, 5),
    [simWorld?.hot_regions],
  )

  const activeWars: SimActiveWar[] = useMemo(() =>
    ((simWorld?.active_wars ?? []) as SimActiveWar[]).slice(0, 4),
    [simWorld?.active_wars],
  )

  const activeShocks: SimActiveShock[] = useMemo(() =>
    ((simWorld?.active_shocks ?? []) as SimActiveShock[]).slice(0, 4),
    [simWorld?.active_shocks],
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
    ((simWorld?.recent_events ?? []) as SimEvent[]).slice(-14).reverse(),
    [simWorld?.recent_events],
  )

  function factionName(name?: string | null): string {
    if (!name) return 'None'
    return factionDisplayMap[name] ?? name
  }

  const summary = simWorld?.summary

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
            {summary && (
              <div className="px-3 py-2 border-b border-gray-800">
                <SectionTitle>World Pulse</SectionTitle>
                <div className="grid grid-cols-3 gap-1.5">
                  <MetricTile label="Regions" value={`${summary.owned_regions}/${summary.total_regions}`} title="Owned regions / total regions" />
                  <MetricTile label="Unowned" value={String(summary.unowned_regions)} tone={summary.unowned_regions > 30 ? 'warn' : 'neutral'} />
                  <MetricTile label="Pop" value={fmtNum(summary.total_population)} />
                  <MetricTile label="Wars" value={String(summary.active_wars)} tone={summary.active_wars > 0 ? 'bad' : 'neutral'} />
                  <MetricTile label="Unrest" value={fmtPct(summary.average_unrest)} tone={summary.average_unrest > 0.45 ? 'bad' : summary.average_unrest > 0.25 ? 'warn' : 'neutral'} title={`${summary.high_unrest_regions} high-unrest regions`} />
                  <MetricTile label="Shocks" value={String(summary.active_shocks)} tone={summary.active_shocks > 0 ? 'warn' : 'neutral'} />
                </div>
                <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                  <span>{summary.active_factions} factions</span>
                  <span>{summary.successor_factions} successors</span>
                  <span>{summary.rivalries} rivalries</span>
                  <span>{summary.pacts + summary.alliances} accords</span>
                  <span>{summary.recent_events} recent events</span>
                </div>
                {treasuryLeader && (
                  <div className="mt-2 rounded bg-gray-800/60 px-2 py-1.5 text-xs">
                    <span className="text-gray-500">Treasury leader </span>
                    <span className="text-gray-200 font-medium">{treasuryLeader.display_name}</span>
                    <span className="text-gray-500"> at </span>
                    <span className="text-gray-200">{fmtTreasury(treasuryLeader.treasury)}</span>
                  </div>
                )}
              </div>
            )}

            {hotRegions.length > 0 && (
              <div className="px-3 py-2 border-b border-gray-800">
                <SectionTitle>Pressure Regions</SectionTitle>
                <div className="flex flex-col gap-1.5">
                  {hotRegions.map((region) => {
                    const active = simDetailSelection?.type === 'region' && simDetailSelection.regionName === region.name
                    return (
                    <button
                      key={region.name}
                      type="button"
                      onClick={() => setSimDetailSelection({ type: 'region', regionName: region.name })}
                      className={`w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${active ? 'bg-indigo-950/60 border border-indigo-600/50' : 'bg-gray-800/50 border border-transparent'}`}
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ background: region.owner ? factionColors[region.owner] : '#6b7280' }}
                        />
                        <span className="text-gray-200 font-medium truncate flex-1">{region.display_name}</span>
                        <span className="text-amber-300 tabular-nums">{fmtPct(region.pressure)}</span>
                      </div>
                      <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-gray-500">
                        <span>Unrest {fmtPct(region.unrest)}</span>
                        <span>Food {fmtSigned(region.food_deficit, 0)}</span>
                        <span>Shock {fmtPct(region.shock_exposure)}</span>
                      </div>
                    </button>
                    )
                  })}
                </div>
              </div>
            )}

            {(activeWars.length > 0 || activeShocks.length > 0) && (
              <div className="px-3 py-2 border-b border-gray-800">
                <SectionTitle>Under The Hood</SectionTitle>
                <div className="flex flex-col gap-1.5">
                  {activeWars.map((war, index) => (
                    <div key={`${war.aggressor}-${war.defender}-${index}`} className="rounded bg-red-950/25 border border-red-900/40 px-2 py-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-red-300 font-medium truncate">{factionName(war.aggressor)}</span>
                        <span className="text-gray-600">vs</span>
                        <span className="text-gray-300 truncate">{factionName(war.defender)}</span>
                      </div>
                      <div className="text-gray-500 truncate">
                        {war.objective || 'war'} | {war.turns_active} turns | {war.attacks} attacks
                      </div>
                    </div>
                  ))}
                  {activeShocks.map((shock, index) => (
                    <div key={`${shock.kind}-${index}`} className="rounded bg-amber-950/20 border border-amber-900/30 px-2 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-amber-300 font-medium truncate">{fmtEventType(`shock_${shock.kind}`)}</span>
                        <span className="text-gray-400">{fmtPct(shock.intensity)}</span>
                      </div>
                      <div className="text-gray-500 truncate">
                        {shock.affected_regions} regions | {shock.turns_remaining} turns left
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-3 py-2 border-b border-gray-800">
              <SectionTitle>Faction Readout</SectionTitle>
              <div className="flex flex-col gap-2">
                {rankedFactions.map((f, i) => {
                  const netIncome = f.net_income ?? 0
                  const foodCapacity = f.food_capacity ?? 0
                  const foodRatio = foodCapacity > 0 ? (f.food_stored ?? 0) / foodCapacity : 0
                  const admin = f.administrative_efficiency ?? 1
                  const readiness = f.military_readiness ?? 0
                  const active = simDetailSelection?.type === 'faction' && simDetailSelection.factionName === f.name
                  return (
                    <button
                      key={f.name}
                      type="button"
                      onClick={() => setSimDetailSelection({ type: 'faction', factionName: f.name })}
                      className={`w-full rounded px-2 py-2 text-left transition-colors hover:bg-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${active ? 'bg-indigo-950/60 border border-indigo-600/50' : 'bg-gray-800/45 border border-transparent'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-4 shrink-0 tabular-nums">#{i + 1}</span>
                        <span
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ background: factionColors[f.name] }}
                        />
                        <span className="text-sm font-medium text-gray-100 truncate flex-1">{f.display_name}</span>
                        {f.is_rebel && <span className="text-[10px] text-amber-300 uppercase tracking-wide">new</span>}
                      </div>
                      <div className="mt-1 grid grid-cols-4 gap-1 text-[11px] text-gray-400 tabular-nums">
                        <span><span className="text-gray-200">{f.owned_regions}</span> reg</span>
                        <span><span className="text-gray-200">{fmtNum(f.population)}</span> pop</span>
                        <span className="text-gray-200">{fmtTreasury(f.treasury)}</span>
                        <span className={netIncome >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmtSigned(netIncome, 1)}</span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                        <div title={`Food stores ${fmtNum(f.food_stored ?? 0)} / ${fmtNum(foodCapacity)}`}>
                          <div className="text-[10px] text-gray-500 mb-0.5">Food</div>
                          <MiniBar value={foodRatio} tone={(f.food_balance ?? 0) < 0 ? 'amber' : 'emerald'} />
                        </div>
                        <div title={`Administrative efficiency ${fmtPct(admin)}`}>
                          <div className="text-[10px] text-gray-500 mb-0.5">Admin</div>
                          <MiniBar value={admin} tone={admin < 0.55 ? 'red' : admin < 0.75 ? 'amber' : 'indigo'} />
                        </div>
                        <div title={`Military readiness ${fmtPct(readiness)}`}>
                          <div className="text-[10px] text-gray-500 mb-0.5">Army</div>
                          <MiniBar value={readiness} tone={readiness < 0.35 ? 'red' : readiness < 0.55 ? 'amber' : 'indigo'} />
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                        {f.ruler_name && <span className="truncate">Ruler {f.ruler_name}</span>}
                        {typeof f.legitimacy === 'number' && <span>Legit {fmtPct(f.legitimacy)}</span>}
                        {typeof f.technology === 'number' && <span>Tech {fmtPct(f.technology)}</span>}
                        {f.top_rival && <span className="truncate">Rival {factionName(f.top_rival)}</span>}
                      </div>
                      {f.doctrine_label && (
                        <div className="mt-0.5 text-xs text-gray-600 italic truncate">{f.doctrine_label}</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Recent events */}
            {recentEvents.length > 0 && (
              <div className="px-3 py-2 flex-1 min-h-0">
                <SectionTitle>Event Feed</SectionTitle>
                <div className="flex flex-col gap-1.5 overflow-y-auto max-h-72 pr-1">
                  {recentEvents.map((ev, i) => {
                    const displayFaction = ev.faction ? factionName(ev.faction) : null
                    const color = ev.faction ? factionColors[ev.faction] : undefined
                    const details = eventDetail(ev)
                    const active = simDetailSelection?.type === 'event' && simDetailSelection.event === ev
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSimDetailSelection({ type: 'event', event: ev })}
                        className={`w-full rounded px-2 py-1.5 text-xs flex items-start gap-2 text-left transition-colors hover:bg-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${active ? 'bg-indigo-950/60 border border-indigo-600/50' : 'bg-gray-800/40 border border-transparent'}`}
                      >
                        <span className="text-gray-600 tabular-nums w-6 shrink-0">T{ev.turn ?? simWorld.turn}</span>
                        {color && (
                          <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-gray-300 font-medium">{fmtEventType(ev.type ?? '')}</span>
                          {displayFaction && <span className="text-gray-500 truncate">{displayFaction}</span>}
                          {details && <span className="text-gray-600 truncate">{details}</span>}
                          {ev.region && <span className="text-gray-600 truncate">→ {ev.region}</span>}
                        </div>
                      </button>
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
