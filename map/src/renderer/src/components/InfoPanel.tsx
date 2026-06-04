import { useMemo, useState, useCallback } from 'react'
import { useMapStore } from '../store/mapStore'
import { TERRAIN_LABELS, ALL_CLIMATES } from '../lib/terrain'
import { getClimateCodeLabel, getClimateColor, normalizeClimate } from '../lib/climate'
import { Climate, FactionData, LoreEntry, RegionData, SettlementSize, CoreStatus, ViewMode, SimDetailSelection, SimEvent, SimFaction, SimHotRegion, SimRegion, SimWorldState } from '../types/map'
import { buildFactionColorMap } from './SimulationPanel'
import { FactionPanel } from './FactionPanel'

const SETTLEMENT_SIZES: SettlementSize[] = ['village', 'town', 'city', 'capital']
const CORE_STATUSES: CoreStatus[] = ['homeland', 'core', 'frontier']

// Toolbar is w-48 = 192px; half of (100vw - 192px) = 50vw - 96px
const PANEL_WIDTH: Record<ViewMode, string> = {
  map:      'w-80',
  balanced: 'w-[500px]',
  panel:    'w-[700px]',
  lore:     'w-[calc(50vw-96px)]',
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  )
}

const INPUT  = 'w-full bg-gray-800 text-sm rounded px-2.5 py-1.5 outline-none focus:ring-1 ring-indigo-500 text-gray-100'
const SELECT = INPUT

interface SimOwner {
  displayName: string
  color: string
}

function fmtSimNum(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(0)}k`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function fmtSimMoney(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  const sign = n < 0 ? '-' : ''
  return `${sign}$${fmtSimNum(Math.abs(n))}`
}

function fmtSimSigned(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}`
}

function fmtSimPct(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  return `${Math.round(n * 100)}%`
}

function fmtSimEventType(type: string | null | undefined): string {
  if (!type) return 'Event'
  const labels: Record<string, string> = {
    expand: 'Expand',
    attack: 'Attack',
    develop: 'Develop',
    war_declared: 'War Declared',
    war_peace: 'War Peace',
    diplomacy_pact: 'Pact',
    diplomacy_rivalry: 'Rivalry',
    diplomacy_tributary: 'Tributary',
    diplomacy_truce: 'Truce',
    unrest_secession: 'Secession',
    rebel_independence: 'Independence',
    shock_trade_collapse: 'Trade Collapse',
    shock_climate_anomaly: 'Climate Shock',
    technology_adoption: 'Technology',
    technology_institutionalized: 'Institutional Tech',
  }
  return labels[type] ?? type.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function fmtSimKey(key: string): string {
  return key.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function fmtSimValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'None'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '0'
    if (Math.abs(value) <= 1 && value !== 0) return value.toFixed(2)
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map(fmtSimValue).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function DetailMetric({ label, value, tone = 'neutral' }: {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const toneClass = {
    neutral: 'text-gray-100',
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-red-300',
  }[tone]
  return (
    <div className="rounded bg-gray-800/70 px-2.5 py-2 min-w-0">
      <div className={`text-base font-semibold tabular-nums truncate ${toneClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 truncate">{label}</div>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</h3>
      {children}
    </section>
  )
}

function DetailRows({ rows }: { rows: [string, string | number | null | undefined][] }) {
  return (
    <div className="rounded bg-gray-800/45 divide-y divide-gray-700/50">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2 px-2.5 py-1.5 text-sm">
          <span className="text-gray-500">{label}</span>
          <span className="text-gray-200 truncate">{value ?? 'None'}</span>
        </div>
      ))}
    </div>
  )
}

function findSimRegion(simWorld: SimWorldState, regionName: string | null | undefined): SimRegion | undefined {
  if (!regionName) return undefined
  return simWorld.regions.find((region) => region.name === regionName || region.display_name === regionName)
}

function findSimFaction(simWorld: SimWorldState, factionName: string | null | undefined): SimFaction | undefined {
  if (!factionName) return undefined
  return simWorld.factions.find((faction) => faction.name === factionName || faction.display_name === factionName)
}

function getEventFactionRefs(event: SimEvent, simWorld: SimWorldState): string[] {
  const candidates = [
    event.faction,
    event.details?.target_faction,
    event.details?.defender,
    event.details?.aggressor,
    event.details?.winner,
    event.details?.loser,
    event.details?.counterpart,
    event.details?.rebel_faction,
    event.details?.origin_faction,
  ]
  const names = new Set<string>()
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const faction = findSimFaction(simWorld, candidate)
    if (faction) names.add(faction.name)
  }
  return [...names]
}

function eventTouchesFaction(event: SimEvent, factionName: string): boolean {
  if (event.faction === factionName) return true
  return Object.values(event.details ?? {}).some((value) => value === factionName)
}

function SimulationDetailPanel({
  panelW,
  selection,
  simWorld,
  factionColors,
}: {
  panelW: string
  selection: SimDetailSelection
  simWorld: SimWorldState
  factionColors: Record<string, string>
}) {
  const setSimDetailSelection = useMapStore((s) => s.setSimDetailSelection)
  const events = simWorld.recent_events ?? []

  function factionLabel(name: string | null | undefined): string {
    return findSimFaction(simWorld, name)?.display_name ?? name ?? 'None'
  }

  function openFaction(name: string | null | undefined) {
    const faction = findSimFaction(simWorld, name)
    if (faction) setSimDetailSelection({ type: 'faction', factionName: faction.name })
  }

  function openRegion(name: string | null | undefined) {
    const region = findSimRegion(simWorld, name)
    if (region) setSimDetailSelection({ type: 'region', regionName: region.name })
  }

  function renderEventButton(event: SimEvent, index: number) {
    return (
      <button
        key={`${event.type}-${event.turn ?? 'x'}-${index}`}
        type="button"
        onClick={() => setSimDetailSelection({ type: 'event', event })}
        className="rounded bg-gray-800/45 px-2.5 py-2 text-left hover:bg-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 tabular-nums">T{event.turn ?? simWorld.turn}</span>
          <span className="text-gray-200 font-medium truncate">{fmtSimEventType(event.type)}</span>
        </div>
        <div className="text-xs text-gray-500 truncate">
          {[factionLabel(event.faction), event.region].filter(Boolean).join(' | ')}
        </div>
      </button>
    )
  }

  let title = 'Simulation Detail'
  let subtitle = simWorld.turn_label
  let swatch: string | undefined
  let content: React.ReactNode

  if (selection.type === 'faction') {
    const faction = findSimFaction(simWorld, selection.factionName)
    if (!faction) {
      title = 'Faction Missing'
      subtitle = selection.factionName
      content = <p className="text-sm text-gray-500 italic">This faction is no longer present in the current simulation state.</p>
    } else {
      title = faction.display_name
      subtitle = faction.name
      swatch = factionColors[faction.name]
      const ownedRegions = simWorld.regions
        .filter((region) => region.owner === faction.name)
        .sort((a, b) => b.population - a.population || a.display_name.localeCompare(b.display_name))
      const factionEvents = events
        .filter((event) => eventTouchesFaction(event, faction.name))
        .slice(-8)
        .reverse()
      content = (
        <>
          <div className="grid grid-cols-2 gap-2">
            <DetailMetric label="Regions" value={String(faction.owned_regions)} />
            <DetailMetric label="Population" value={fmtSimNum(faction.population)} />
            <DetailMetric label="Treasury" value={fmtSimMoney(faction.treasury)} />
            <DetailMetric
              label="Net Income"
              value={fmtSimSigned(faction.net_income ?? 0)}
              tone={(faction.net_income ?? 0) >= 0 ? 'good' : 'bad'}
            />
          </div>
          <DetailSection title="Profile">
            <DetailRows rows={[
              ['Doctrine', faction.doctrine_label],
              ['Government', faction.government_type],
              ['Tier', faction.polity_tier],
              ['Culture', faction.culture_name],
              ['Ruler', faction.ruler_name],
              ['Legitimacy', typeof faction.legitimacy === 'number' ? fmtSimPct(faction.legitimacy) : null],
              ['Status', faction.is_rebel ? 'Successor / rebel polity' : 'Established polity'],
              ['Origin', faction.origin_faction ? factionLabel(faction.origin_faction) : null],
            ]} />
          </DetailSection>
          <DetailSection title="Capacity">
            <DetailRows rows={[
              ['Effective Income', typeof faction.effective_income === 'number' ? fmtSimMoney(faction.effective_income) : null],
              ['Maintenance', typeof faction.maintenance === 'number' ? fmtSimMoney(faction.maintenance) : null],
              ['Food Balance', typeof faction.food_balance === 'number' ? fmtSimSigned(faction.food_balance) : null],
              ['Food Stored', `${fmtSimNum(faction.food_stored)} / ${fmtSimNum(faction.food_capacity)}`],
              ['Administration', typeof faction.administrative_efficiency === 'number' ? fmtSimPct(faction.administrative_efficiency) : null],
              ['Overextension', typeof faction.administrative_overextension === 'number' ? fmtSimPct(faction.administrative_overextension) : null],
              ['Military Readiness', typeof faction.military_readiness === 'number' ? fmtSimPct(faction.military_readiness) : null],
              ['Standing Forces', typeof faction.standing_forces === 'number' ? fmtSimNum(faction.standing_forces) : null],
              ['Manpower', typeof faction.manpower_pool === 'number' ? fmtSimNum(faction.manpower_pool) : null],
              ['Technology', typeof faction.technology === 'number' ? fmtSimPct(faction.technology) : null],
            ]} />
          </DetailSection>
          <DetailSection title="Diplomacy">
            <DetailRows rows={[
              ['Top Ally', faction.top_ally ? factionLabel(faction.top_ally) : null],
              ['Top Rival', faction.top_rival ? factionLabel(faction.top_rival) : null],
              ['Overlord', faction.overlord ? factionLabel(faction.overlord) : null],
              ['Tributaries', faction.tributary_count],
              ['Claim Disputes', faction.claim_dispute_count],
            ]} />
          </DetailSection>
          <DetailSection title="Owned Regions">
            <div className="flex flex-col gap-1.5">
              {ownedRegions.length === 0 && <p className="text-sm text-gray-500 italic">No held regions.</p>}
              {ownedRegions.slice(0, 12).map((region) => (
                <button
                  key={region.name}
                  type="button"
                  onClick={() => openRegion(region.name)}
                  className="flex items-center gap-2 rounded bg-gray-800/45 px-2.5 py-1.5 text-left hover:bg-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <span className="text-sm text-gray-200 truncate flex-1">{region.display_name || region.name}</span>
                  <span className="text-xs text-gray-500 tabular-nums">{fmtSimNum(region.population)}</span>
                  <span className="text-xs text-amber-300 tabular-nums">{fmtSimPct(region.unrest)}</span>
                </button>
              ))}
            </div>
          </DetailSection>
          {factionEvents.length > 0 && (
            <DetailSection title="Recent Faction Events">
              <div className="flex flex-col gap-1.5">
                {factionEvents.map(renderEventButton)}
              </div>
            </DetailSection>
          )}
        </>
      )
    }
  } else if (selection.type === 'region') {
    const region = findSimRegion(simWorld, selection.regionName)
    if (!region) {
      title = 'Region Missing'
      subtitle = selection.regionName
      content = <p className="text-sm text-gray-500 italic">This region is not present in the current simulation state.</p>
    } else {
      const owner = findSimFaction(simWorld, region.owner)
      const hot = (simWorld.hot_regions ?? []).find((item: SimHotRegion) => item.name === region.name)
      const regionEvents = events
        .filter((event) => event.region === region.name || event.region === region.display_name)
        .slice(-8)
        .reverse()
      title = region.display_name || region.name
      subtitle = region.name
      swatch = region.owner ? factionColors[region.owner] : '#6b7280'
      content = (
        <>
          <div className="grid grid-cols-2 gap-2">
            <DetailMetric label="Population" value={fmtSimNum(region.population)} />
            <DetailMetric label="Resources" value={String(region.resources)} />
            <DetailMetric
              label="Unrest"
              value={fmtSimPct(region.unrest)}
              tone={region.unrest > 0.55 ? 'bad' : region.unrest > 0.3 ? 'warn' : 'neutral'}
            />
            <DetailMetric label="Pressure" value={hot ? fmtSimPct(hot.pressure) : 'None'} tone={hot && hot.pressure > 0.55 ? 'warn' : 'neutral'} />
          </div>
          <DetailSection title="Control">
            <div className="rounded bg-gray-800/45 px-2.5 py-2">
              {owner ? (
                <button
                  type="button"
                  onClick={() => openFaction(owner.name)}
                  className="flex items-center gap-2 rounded text-left hover:text-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: factionColors[owner.name] }} />
                  <span className="text-sm text-gray-100">{owner.display_name}</span>
                </button>
              ) : (
                <p className="text-sm text-gray-500 italic">Unowned</p>
              )}
            </div>
          </DetailSection>
          <DetailSection title="Conditions">
            <DetailRows rows={[
              ['Climate', region.climate_label || region.climate],
              ['Climate Anomaly', typeof region.climate_anomaly === 'number' ? region.climate_anomaly.toFixed(2) : null],
              ['Food Deficit', typeof hot?.food_deficit === 'number' ? fmtSimSigned(hot.food_deficit, 0) : null],
              ['Trade Pressure', typeof hot?.trade_warfare_pressure === 'number' ? fmtSimPct(hot.trade_warfare_pressure) : null],
              ['Shock Exposure', typeof hot?.shock_exposure === 'number' ? fmtSimPct(hot.shock_exposure) : null],
            ]} />
          </DetailSection>
          {regionEvents.length > 0 && (
            <DetailSection title="Recent Region Events">
              <div className="flex flex-col gap-1.5">
                {regionEvents.map(renderEventButton)}
              </div>
            </DetailSection>
          )}
        </>
      )
    }
  } else {
    const event = selection.event
    const factionRefs = getEventFactionRefs(event, simWorld)
    const region = findSimRegion(simWorld, event.region)
    title = fmtSimEventType(event.type)
    subtitle = `Turn ${event.turn ?? simWorld.turn}`
    swatch = event.faction ? factionColors[event.faction] : undefined
    content = (
      <>
        <div className="grid grid-cols-2 gap-2">
          <DetailMetric label="Turn" value={String(event.turn ?? simWorld.turn)} />
          <DetailMetric label="Significance" value={typeof event.significance === 'number' ? event.significance.toFixed(2) : 'None'} />
        </div>
        {(factionRefs.length > 0 || region) && (
          <DetailSection title="Related">
            <div className="flex flex-wrap gap-2">
              {factionRefs.map((name) => {
                const faction = findSimFaction(simWorld, name)
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => openFaction(name)}
                    className="inline-flex items-center gap-1.5 rounded bg-gray-800/70 px-2 py-1 text-sm text-gray-200 hover:bg-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: factionColors[name] }} />
                    {faction?.display_name ?? name}
                  </button>
                )
              })}
              {region && (
                <button
                  type="button"
                  onClick={() => openRegion(region.name)}
                  className="rounded bg-gray-800/70 px-2 py-1 text-sm text-gray-200 hover:bg-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {region.display_name || region.name}
                </button>
              )}
            </div>
          </DetailSection>
        )}
        <DetailSection title="Details">
          <div className="rounded bg-gray-800/45 divide-y divide-gray-700/50">
            {Object.entries(event.details ?? {}).length === 0 && (
              <p className="px-2.5 py-2 text-sm text-gray-500 italic">No detail payload.</p>
            )}
            {Object.entries(event.details ?? {}).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2 px-2.5 py-1.5 text-sm">
                <span className="text-gray-500">{fmtSimKey(key)}</span>
                <span className="text-gray-200 break-words">{fmtSimValue(value)}</span>
              </div>
            ))}
          </div>
        </DetailSection>
        <DetailSection title="Impact">
          <div className="rounded bg-gray-800/45 divide-y divide-gray-700/50">
            {Object.entries(event.impact ?? {}).length === 0 && (
              <p className="px-2.5 py-2 text-sm text-gray-500 italic">No impact payload.</p>
            )}
            {Object.entries(event.impact ?? {}).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2 px-2.5 py-1.5 text-sm">
                <span className="text-gray-500">{fmtSimKey(key)}</span>
                <span className="text-gray-200 break-words">{fmtSimValue(value)}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      </>
    )
  }

  return (
    <aside className={`${panelW} bg-gray-900 text-gray-100 flex flex-col shrink-0 overflow-y-auto border-l border-gray-800`}>
      <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Simulation Detail</div>
            <h2 className="mt-1 text-base font-semibold text-gray-100 flex items-center gap-2 min-w-0">
              {swatch && <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: swatch }} />}
              <span className="truncate">{title}</span>
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 truncate">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setSimDetailSelection(null)}
            className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-5">
        {content}
      </div>
    </aside>
  )
}

// ── Simple lore body renderer ─────────────────────────────────────────────────
// Converts ## headings and paragraph blocks without a markdown library.

function LoreBody({ body }: { body: string }) {
  const nodes: React.ReactNode[] = []
  let paraLines: string[] = []
  let key = 0

  function flushPara() {
    const text = paraLines.join('\n').trim()
    if (text) nodes.push(
      <p key={key++} className="text-base text-gray-200 leading-7 mb-4">{text}</p>
    )
    paraLines = []
  }

  for (const line of body.split('\n')) {
    if (line.startsWith('# ')) {
      flushPara()
      // H1 omitted — shown as the panel header above
    } else if (line.startsWith('## ')) {
      flushPara()
      nodes.push(
        <h3 key={key++} className="text-base font-semibold text-gray-200 mt-6 mb-2 pb-1 border-b border-gray-700">
          {line.slice(3)}
        </h3>
      )
    } else if (line.startsWith('### ')) {
      flushPara()
      nodes.push(
        <h4 key={key++} className="text-sm font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-1">
          {line.slice(4)}
        </h4>
      )
    } else if (line.trim() === '---') {
      flushPara()
      nodes.push(<hr key={key++} className="border-gray-700 my-5" />)
    } else if (line.trim() === '') {
      flushPara()
    } else {
      paraLines.push(line)
    }
  }
  flushPara()

  return <>{nodes}</>
}

// ── Lore entry search ─────────────────────────────────────────────────────────

function LoreSearch({
  currentRef,
  onLink,
  onClose,
}: {
  currentRef: string | undefined
  onLink: (entry: LoreEntry) => void
  onClose: () => void
}) {
  const loreFile = useMapStore((s) => s.loreFile)
  const [query, setQuery] = useState('')

  const CATEGORY_ORDER = [
    'region', 'geography', 'peoples', 'culture', 'history',
    'language', 'phenomenon', 'artifact', 'cosmology', 'fauna', 'natural history', 'misc',
  ]

  const sorted = (loreFile?.entries ?? [])
    .filter((e) => {
      const q = query.toLowerCase()
      return !q || e.name.toLowerCase().includes(q) || e.tags.some(t => t.toLowerCase().includes(q))
    })
    .sort((a, b) => {
      const q = query.toLowerCase()
      if (a.name.toLowerCase() === q) return -1
      if (b.name.toLowerCase() === q) return 1
      const ai = CATEGORY_ORDER.indexOf(a.category)
      const bi = CATEGORY_ORDER.indexOf(b.category)
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      return a.name.localeCompare(b.name)
    })
    .slice(0, 40)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          className="flex-1 bg-gray-700 text-sm rounded px-2.5 py-1.5 outline-none focus:ring-1 ring-indigo-500 text-gray-100 placeholder-gray-500"
          placeholder="Search by name or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm px-2">✕</button>
      </div>
      <div className="max-h-64 overflow-y-auto rounded bg-gray-800 border border-gray-700 flex flex-col">
        {sorted.length === 0 && <p className="text-sm text-gray-500 px-3 py-2 italic">No matches</p>}
        {sorted.map((entry) => (
          <button
            key={entry.id}
            onClick={() => { onLink(entry); onClose() }}
            className={`flex items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-gray-700 transition-colors border-b border-gray-700/40 last:border-0
              ${entry.id === currentRef ? 'bg-indigo-900/40 text-indigo-200' : 'text-gray-200'}`}
          >
            <span className="flex-1 truncate">{entry.name}</span>
            <span className="text-xs text-gray-500 capitalize shrink-0">{entry.category}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Lore auto-link helpers ────────────────────────────────────────────────────

function scoreLoreMatch(regionName: string, entryName: string): number {
  const r = regionName.toLowerCase().trim()
  const e = entryName.toLowerCase().trim()
  if (r === e) return 3
  if (e.startsWith(r) || r.startsWith(e)) return 2
  if (e.includes(r) || r.includes(e)) return 1
  return 0
}

function useLoreSuggestions(regionName: string | undefined, linked: LoreEntry | undefined, loreFile: { entries: LoreEntry[] } | null): LoreEntry[] {
  return useMemo(() => {
    if (!loreFile || !regionName || linked) return []
    return loreFile.entries
      .map((entry) => ({ entry, score: scoreLoreMatch(regionName, entry.name) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
      .slice(0, 3)
      .map(({ entry }) => entry)
  }, [loreFile, regionName, linked])
}

// ── Lore link control (used in non-lore view modes) ───────────────────────────

function LoreLinkField({
  currentRef,
  regionName,
  onLink,
  onClear,
}: {
  currentRef: string | undefined
  regionName?: string
  onLink: (entry: LoreEntry) => void
  onClear: () => void
}) {
  const loreFile  = useMapStore((s) => s.loreFile)
  const viewMode  = useMapStore((s) => s.viewMode)
  const [open, setOpen]         = useState(false)
  const [expanded, setExpanded] = useState(false)

  const linked      = loreFile?.entries.find((e) => e.id === currentRef)
  const suggestions = useLoreSuggestions(regionName, linked, loreFile ?? null)

  if (!loreFile) {
    return <p className="text-sm text-gray-500 italic">Load a lore file to enable linking.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {linked ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-800 rounded px-2.5 py-1.5 min-w-0">
            <span className="text-sm text-gray-100 truncate block">{linked.name}</span>
            <span className="text-xs text-indigo-400 capitalize">{linked.category}</span>
          </div>
          <button onClick={onClear} className="text-gray-500 hover:text-red-400 px-1.5 py-1 text-sm shrink-0 rounded hover:bg-gray-800 transition-colors" title="Remove link">✕</button>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 italic">— unlinked —</p>
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-1">
              {suggestions.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => { onLink(entry); setOpen(false) }}
                  className="flex items-baseline gap-2 px-2.5 py-1.5 rounded bg-indigo-900/30 border border-indigo-700/40 hover:bg-indigo-800/40 transition-colors text-left"
                >
                  <span className="text-sm text-indigo-200 truncate flex-1">{entry.name}</span>
                  <span className="text-xs text-indigo-400 capitalize shrink-0">{entry.category}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-indigo-400 hover:text-indigo-300 text-left transition-colors"
      >
        {open ? '▲ close search' : linked ? '▼ change link' : '▼ link entry'}
      </button>

      {open && (
        <LoreSearch currentRef={currentRef} onLink={onLink} onClose={() => setOpen(false)} />
      )}

      {linked && !open && (
        <div className="border border-gray-700 rounded-md p-3 flex flex-col gap-2 bg-gray-800/50">
          <p className="text-sm text-gray-300 leading-relaxed">{linked.summary}</p>
          <button onClick={() => setExpanded((v) => !v)} className="text-sm text-indigo-400 hover:text-indigo-300 text-left transition-colors">
            {expanded ? '▲ collapse' : '▼ full entry'}
          </button>
          {expanded && (
            <textarea
              readOnly
              className="w-full bg-gray-900 text-sm rounded px-2.5 py-2 resize-none text-gray-300 leading-relaxed font-mono border border-gray-700"
              rows={viewMode === 'panel' ? 22 : viewMode === 'balanced' ? 16 : 12}
              value={linked.body}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Lore reader (used in 'lore' view mode) ────────────────────────────────────

function DominantClimateField({
  regionId,
}: {
  regionId: string
}) {
  const map = useMapStore((s) => s.map)
  const { dominant, total } = useMemo(() => {
    if (!map) return { dominant: null as Climate | null, total: 0 }
    const counts: Partial<Record<Climate, number>> = {}
    for (const hex of Object.values(map.hexes)) {
      if (hex.region === regionId && hex.climate) {
        const climate = normalizeClimate(hex.climate)
        counts[climate] = (counts[climate] ?? 0) + 1
      }
    }
    const entries = Object.entries(counts) as [Climate, number][]
    if (!entries.length) return { dominant: null as Climate | null, total: 0 }
    const tot = entries.reduce((s, [, n]) => s + n, 0)
    const dom = entries.reduce((a, b) => b[1] > a[1] ? b : a)[0]
    return { dominant: dom, total: tot }
  }, [map, regionId])

  return (
    <Field label="Climate">
      {dominant ? (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-800 rounded">
          <span className="inline-block w-3 h-3 rounded-sm border border-gray-600 shrink-0"
            style={{ background: getClimateColor(dominant) }} />
          <span className="text-sm text-gray-200 truncate">{getClimateCodeLabel(dominant)}</span>
          <span className="text-xs text-gray-500 ml-auto">{total} hex{total !== 1 ? 'es' : ''}</span>
        </div>
      ) : (
        <p className="text-sm text-gray-500 italic px-2.5 py-1.5 bg-gray-800 rounded">
          — paint hexes to set —
        </p>
      )}
    </Field>
  )
}

function FactionField({
  owner,
  value,
  factions,
  onChange,
  onSelectFaction,
}: {
  owner: SimOwner | null | undefined
  value: string
  factions: Record<string, FactionData>
  onChange: (value: string) => void
  onSelectFaction?: (id: string) => void
}) {
  const factionIds = Object.keys(factions)
  return (
    <Field label="Faction">
      {owner !== undefined ? (
        owner ? (
          <div className="flex items-center gap-2 rounded bg-gray-800 px-2.5 py-1.5 text-sm text-gray-100">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: owner.color }} />
            <span className="truncate">{owner.displayName}</span>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic px-2.5 py-1.5 bg-gray-800 rounded">Unowned</p>
        )
      ) : factionIds.length > 0 ? (
        <div className="flex items-center gap-2">
          {value && factions[value] && (
            <span className="inline-block w-4 h-4 rounded-sm border border-gray-600 shrink-0"
              style={{ background: factions[value].color }} />
          )}
          <select
            className={`${INPUT} flex-1`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— unowned —</option>
            {factionIds.map((id) => (
              <option key={id} value={id}>{factions[id].name}</option>
            ))}
          </select>
          {value && onSelectFaction && (
            <button
              className="text-xs text-indigo-400 hover:text-indigo-200 shrink-0 whitespace-nowrap"
              onClick={() => onSelectFaction(value)}
              title="Open faction editor"
            >
              Edit
            </button>
          )}
        </div>
      ) : (
        <input
          className={INPUT}
          value={value}
          placeholder="e.g. Mittoli Republic"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

function SimulationClimateField({ region }: { region: SimRegion | null | undefined }) {
  if (!region?.climate) return null
  const climate = normalizeClimate(region.climate)
  const label = region.climate_label ? `${climate} ${region.climate_label}` : getClimateCodeLabel(climate)
  const anomaly = Number(region.climate_anomaly ?? 0)
  return (
    <Field label="Simulation Climate">
      <div className="flex items-center gap-2 rounded bg-gray-800 px-2.5 py-1.5 text-sm text-gray-100">
        <span className="inline-block w-3 h-3 rounded-sm border border-gray-600 shrink-0" style={{ background: getClimateColor(climate) }} />
        <span className="truncate">{label}</span>
        {Math.abs(anomaly) > 0.01 && (
          <span className="text-xs text-gray-500 ml-auto tabular-nums">{anomaly.toFixed(2)}</span>
        )}
      </div>
    </Field>
  )
}

function LoreReader({ regionId, rd }: { regionId: string; rd: RegionData }) {
  const loreFile     = useMapStore((s) => s.loreFile)
  const upsertRegion = useMapStore((s) => s.upsertRegion)
  const [searching, setSearching]   = useState(false)
  const [showFields, setShowFields] = useState(false)

  const linked      = loreFile?.entries.find((e) => e.id === rd.loreRef)
  const suggestions = useLoreSuggestions(rd.name, linked, loreFile ?? null)
  const linkEntry   = useCallback((entry: LoreEntry) => { upsertRegion(regionId, { loreRef: entry.id }); setSearching(false) }, [upsertRegion, regionId])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Sticky header ── */}
      <div className="shrink-0 px-6 py-4 border-b border-gray-700 bg-gray-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="inline-block w-3 h-3 rounded-sm border border-gray-500 shrink-0" style={{ background: rd.color }} />
              <h2 className="text-base font-semibold text-gray-200 truncate">{rd.name}</h2>
            </div>
            {linked ? (
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium text-indigo-300">{linked.name}</span>
                <span className="text-xs text-gray-500 capitalize">{linked.category}</span>
                <button
                  onClick={() => setSearching((v) => !v)}
                  className="text-xs text-gray-500 hover:text-indigo-400 transition-colors"
                >
                  {searching ? 'cancel' : 'change'}
                </button>
                <button
                  onClick={() => upsertRegion(regionId, { loreRef: undefined })}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  unlink
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 mt-0.5">
                {suggestions.length > 0 && !searching && (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => linkEntry(entry)}
                        className="flex items-baseline gap-1.5 px-2 py-0.5 rounded bg-indigo-900/40 border border-indigo-700/40 hover:bg-indigo-800/50 transition-colors"
                      >
                        <span className="text-xs text-indigo-200">{entry.name}</span>
                        <span className="text-xs text-indigo-500 capitalize">{entry.category}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setSearching((v) => !v)}
                  className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {searching ? '▲ cancel' : suggestions.length > 0 ? '▼ search all' : '+ Link lore entry'}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowFields((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-300 shrink-0 transition-colors mt-0.5"
            title="Toggle region fields"
          >
            {showFields ? '▲ fields' : '▼ fields'}
          </button>
        </div>

        {/* Search inline */}
        {searching && (
          <div className="mt-3">
            <LoreSearch
              currentRef={rd.loreRef}
              onLink={linkEntry}
              onClose={() => setSearching(false)}
            />
          </div>
        )}
      </div>

      {/* ── Collapsible region fields ── */}
      {showFields && (
        <div className="shrink-0 px-6 py-4 border-b border-gray-700 bg-gray-900/80 flex flex-col gap-3">
          <Field label="Display name">
            <input className={INPUT} value={rd.name} onChange={(e) => upsertRegion(regionId, { name: e.target.value })} />
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-3">
              <input type="color" className="w-9 h-9 rounded cursor-pointer bg-transparent border-0"
                value={rd.color} onChange={(e) => upsertRegion(regionId, { color: e.target.value })} />
              <span className="text-sm text-gray-400 font-mono">{rd.color}</span>
            </div>
          </Field>
          <Field label="Faction">
            <input className={INPUT} value={rd.faction ?? ''} placeholder="e.g. Mittoli Republic"
              onChange={(e) => upsertRegion(regionId, { faction: e.target.value || undefined })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <DominantClimateField regionId={regionId} />
            <Field label="Status">
              <select className={SELECT} value={rd.coreStatus ?? ''}
                onChange={(e) => upsertRegion(regionId, { coreStatus: (e.target.value || undefined) as CoreStatus | undefined })}>
                <option value="">— unset —</option>
                {CORE_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </Field>
          </div>
        </div>
      )}

      {/* ── Lore body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col">
        <div className="flex-1">
          {linked ? (
            <article>
              <h2 className="text-2xl font-bold text-gray-100 mb-1">{linked.name}</h2>
              <p className="text-xs text-indigo-400 uppercase tracking-widest mb-6">{linked.category}</p>
              <LoreBody body={linked.body} />
            </article>
          ) : rd.lore ? (
            <article>
              <p className="text-xs text-gray-500 italic mb-4">Embedded lore (no linked entry)</p>
              <div className="text-base text-gray-200 leading-7 whitespace-pre-wrap">{rd.lore}</div>
            </article>
          ) : !loreFile ? (
            <p className="text-sm text-gray-500 italic">
              Load a lore file from the toolbar, then link an entry to start reading.
            </p>
          ) : (
            <p className="text-sm text-gray-500 italic">
              No lore linked. Click "+ Link lore entry" above to connect this region to its lore.
            </p>
          )}
        </div>

        {/* ── Notes scratchpad ── always visible ── */}
        <div className="mt-8 pt-5 border-t border-gray-700/60">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="shrink-0">
              <path d="M1 8.5L2.5 10 9.5 3 8 1.5 1 8.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M1 8.5L2.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Notes
          </p>
          <textarea
            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3.5 py-3 text-sm text-gray-200 leading-relaxed placeholder-gray-600 outline-none focus:ring-1 focus:border-indigo-500 ring-indigo-500 resize-y transition-colors"
            rows={5}
            placeholder="Things to expand on, questions, ideas for this region…"
            value={rd.notes ?? ''}
            onChange={(e) => upsertRegion(regionId, { notes: e.target.value || undefined })}
          />
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function InfoPanel() {
  const map              = useMapStore((s) => s.map)
  const selectedHex      = useMapStore((s) => s.selectedHex)
  const selectedRegion   = useMapStore((s) => s.selectedRegion)
  const selectedFaction  = useMapStore((s) => s.selectedFaction)
  const setSelectedFaction = useMapStore((s) => s.setSelectedFaction)
  const updateHex        = useMapStore((s) => s.updateHex)
  const upsertRegion     = useMapStore((s) => s.upsertRegion)
  const viewMode         = useMapStore((s) => s.viewMode)
  const simWorld         = useMapStore((s) => s.simWorld)
  const simDetailSelection = useMapStore((s) => s.simDetailSelection)
  const panelW           = PANEL_WIDTH[viewMode]

  const factionColors = useMemo(
    () => buildFactionColorMap(simWorld?.factions ?? []),
    [simWorld?.factions],
  )

  const simOwners = useMemo(() => {
    if (!simWorld) return {}

    const factions = new Map(simWorld.factions.map((f) => [f.name, f]))
    const owners: Record<string, SimOwner | null> = {}

    for (const region of simWorld.regions) {
      const ownerName = region.owner
      const ownerFaction = ownerName ? factions.get(ownerName) : null
      const owner = ownerName
        ? {
            displayName: ownerFaction?.display_name ?? ownerName,
            color: factionColors[ownerName] ?? '#888888',
          }
        : null

      owners[region.name] = owner
      if (region.display_name) owners[region.display_name] = owner
    }

    return owners
  }, [factionColors, simWorld])

  const simRegions = useMemo(() => {
    if (!simWorld) return {}
    const regions: Record<string, SimRegion> = {}
    for (const region of simWorld.regions) {
      regions[region.name] = region
      if (region.display_name) regions[region.display_name] = region
    }
    return regions
  }, [simWorld])

  function getSimOwner(regionId: string | null | undefined): SimOwner | null {
    if (!regionId || !map) return null
    const regionName = map.regions[regionId]?.name
    return simOwners[regionId] ?? (regionName ? simOwners[regionName] : null) ?? null
  }

  function getSimRegion(regionId: string | null | undefined): SimRegion | null {
    if (!regionId || !map) return null
    const regionName = map.regions[regionId]?.name
    return simRegions[regionId] ?? (regionName ? simRegions[regionName] : null) ?? null
  }

  if (simWorld && simDetailSelection) {
    return (
      <SimulationDetailPanel
        panelW={panelW}
        selection={simDetailSelection}
        simWorld={simWorld}
        factionColors={factionColors}
      />
    )
  }

  // ── Lore reader mode ──────────────────────────────────────────────────────
  if (viewMode === 'lore') {
    const regionId = selectedRegion
      ?? (selectedHex && map?.hexes[selectedHex]?.region)
      ?? null

    const rd = regionId ? map?.regions[regionId] : null

    return (
      <aside className={`${panelW} bg-gray-900 text-gray-100 flex flex-col shrink-0 border-l border-gray-800 overflow-hidden`}>
        {rd && regionId ? (
          <LoreReader regionId={regionId} rd={rd} />
        ) : (
          <div className="p-6 text-sm text-gray-500 italic">
            {map ? 'Select a region or hex to read its lore.' : 'No map loaded.'}
          </div>
        )}
      </aside>
    )
  }

  // ── Faction editor panel ─────────────────────────────────────────────────
  if (selectedFaction && map?.factions?.[selectedFaction]) {
    return <FactionPanel factionId={selectedFaction} panelW={panelW} />
  }

  // ── Region-select panel (non-lore modes) ──────────────────────────────────
  if (selectedRegion && map?.regions[selectedRegion]) {
    const rd = map.regions[selectedRegion]
    const hexCount = Object.values(map.hexes).filter(h => h.region === selectedRegion).length
    const simOwner = getSimOwner(selectedRegion)
    const simRegion = getSimRegion(selectedRegion)

    return (
      <aside className={`${panelW} bg-gray-900 text-gray-100 p-5 flex flex-col gap-4 shrink-0 overflow-y-auto border-l border-gray-800`}>
        <div>
          <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2 mb-1">
            <span className="inline-block w-3 h-3 rounded-sm border border-gray-500 shrink-0" style={{ background: rd.color }} />
            {rd.name}
          </h2>
          <p className="text-sm text-gray-500">{hexCount} hex{hexCount !== 1 ? 'es' : ''}</p>
        </div>

        <div className="h-px bg-gray-700" />

        <Field label="Display name">
          <input className={INPUT} value={rd.name}
            onChange={(e) => upsertRegion(selectedRegion, { name: e.target.value })} />
        </Field>
        <Field label="Color">
          <div className="flex items-center gap-3">
            <input type="color" className="w-9 h-9 rounded cursor-pointer bg-transparent border-0"
              value={rd.color} onChange={(e) => upsertRegion(selectedRegion, { color: e.target.value })} />
            <span className="text-sm text-gray-400 font-mono">{rd.color}</span>
          </div>
        </Field>
        <FactionField
          owner={simWorld ? simOwner : undefined}
          value={rd.faction ?? ''}
          factions={map?.factions ?? {}}
          onChange={(value) => upsertRegion(selectedRegion, { faction: value || undefined })}
          onSelectFaction={setSelectedFaction}
        />
        {simWorld && <SimulationClimateField region={simRegion} />}
        <DominantClimateField regionId={selectedRegion} />
        <Field label="Status">
          <select className={SELECT} value={rd.coreStatus ?? ''}
            onChange={(e) => upsertRegion(selectedRegion, { coreStatus: (e.target.value || undefined) as CoreStatus | undefined })}>
            <option value="">— unset —</option>
            {CORE_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Notes">
          <textarea className={`${INPUT} resize-none`} rows={4} value={rd.notes ?? ''} placeholder="Region notes…"
            onChange={(e) => upsertRegion(selectedRegion, { notes: e.target.value || undefined })} />
        </Field>
        <Field label="Lore Entry">
          <LoreLinkField
            currentRef={rd.loreRef}
            regionName={rd.name}
            onLink={(entry) => upsertRegion(selectedRegion, { loreRef: entry.id })}
            onClear={() => upsertRegion(selectedRegion, { loreRef: undefined })}
          />
        </Field>
        {rd.lore && !rd.loreRef && (
          <Field label="Lore (embedded)">
            <textarea className={`${INPUT} resize-none`} rows={10} value={rd.lore ?? ''} placeholder="Lore (markdown)…"
              onChange={(e) => upsertRegion(selectedRegion, { lore: e.target.value || undefined })} />
          </Field>
        )}
      </aside>
    )
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!map || !selectedHex || !map.hexes[selectedHex]) {
    return (
      <aside className={`${panelW} bg-gray-900 text-gray-400 p-5 flex flex-col gap-2 shrink-0 border-l border-gray-800`}>
        <p className="text-sm italic mt-2">Select a hex or region to see details.</p>
      </aside>
    )
  }

  // ── Hex-select panel ──────────────────────────────────────────────────────
  const hex = map.hexes[selectedHex]
  const regionData = hex.region ? map.regions[hex.region] : null
  const simOwner = getSimOwner(hex.region)
  const simRegion = getSimRegion(hex.region)

  return (
    <aside className={`${panelW} bg-gray-900 text-gray-100 p-5 flex flex-col gap-4 shrink-0 overflow-y-auto border-l border-gray-800`}>

      <div>
        <h2 className="text-base font-semibold text-gray-200 mb-0.5">Hex</h2>
        <p className="text-sm text-gray-500 font-mono">({hex.q}, {hex.r})</p>
      </div>

      <div className="h-px bg-gray-700" />

      <Field label="Terrain">
        <p className="text-sm text-gray-200 px-2.5 py-1.5 bg-gray-800 rounded">{TERRAIN_LABELS[hex.terrain]}</p>
      </Field>
      <Field label="Climate">
        <select className={SELECT} value={normalizeClimate(hex.climate)}
          onChange={(e) => updateHex(selectedHex, { climate: normalizeClimate(e.target.value) })}>
          {ALL_CLIMATES.map((c) => <option key={c} value={c}>{getClimateCodeLabel(c)}</option>)}
        </select>
      </Field>
      <Field label="Region">
        <input className={INPUT} value={hex.region ?? ''} placeholder="e.g. Yunethre"
          onChange={(e) => updateHex(selectedHex, { region: e.target.value || undefined })} />
      </Field>
      <Field label="Settlement">
        <input className={INPUT} value={hex.settlement ?? ''} placeholder="Settlement name"
          onChange={(e) => updateHex(selectedHex, { settlement: e.target.value || undefined })} />
      </Field>
      {hex.settlement && (
        <Field label="Size">
          <select className={SELECT} value={hex.settlementSize ?? 'village'}
            onChange={(e) => updateHex(selectedHex, { settlementSize: e.target.value as SettlementSize })}>
            {SETTLEMENT_SIZES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </Field>
      )}
      <Field label="Notes">
        <textarea className={`${INPUT} resize-none`} rows={3} value={hex.notes ?? ''} placeholder="Hex notes…"
          onChange={(e) => updateHex(selectedHex, { notes: e.target.value || undefined })} />
      </Field>

      {regionData && hex.region && (
        <>
          <div className="flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-gray-700" />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm border border-gray-500 shrink-0" style={{ background: regionData.color }} />
              {regionData.name}
            </span>
            <div className="h-px flex-1 bg-gray-700" />
          </div>

          <Field label="Display name">
            <input className={INPUT} value={regionData.name}
              onChange={(e) => upsertRegion(hex.region!, { name: e.target.value })} />
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-3">
              <input type="color" className="w-9 h-9 rounded cursor-pointer bg-transparent border-0"
                value={regionData.color} onChange={(e) => upsertRegion(hex.region!, { color: e.target.value })} />
              <span className="text-sm text-gray-400 font-mono">{regionData.color}</span>
            </div>
          </Field>
          <FactionField
            owner={simWorld ? simOwner : undefined}
            value={regionData.faction ?? ''}
            factions={map?.factions ?? {}}
            onChange={(value) => upsertRegion(hex.region!, { faction: value || undefined })}
            onSelectFaction={setSelectedFaction}
          />
          {simWorld && <SimulationClimateField region={simRegion} />}
          <DominantClimateField regionId={hex.region!} />
          <Field label="Status">
            <select className={SELECT} value={regionData.coreStatus ?? ''}
              onChange={(e) => upsertRegion(hex.region!, { coreStatus: (e.target.value || undefined) as CoreStatus | undefined })}>
              <option value="">— unset —</option>
              {CORE_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Notes">
            <textarea className={`${INPUT} resize-none`} rows={3} value={regionData.notes ?? ''} placeholder="Region notes…"
              onChange={(e) => upsertRegion(hex.region!, { notes: e.target.value || undefined })} />
          </Field>
          <Field label="Lore Entry">
            <LoreLinkField
              currentRef={regionData.loreRef}
              regionName={regionData.name}
              onLink={(entry) => upsertRegion(hex.region!, { loreRef: entry.id })}
              onClear={() => upsertRegion(hex.region!, { loreRef: undefined })}
            />
          </Field>
          {regionData.lore && !regionData.loreRef && (
            <Field label="Lore (embedded)">
              <textarea className={`${INPUT} resize-none`} rows={8} value={regionData.lore ?? ''} placeholder="Lore (markdown)…"
                onChange={(e) => upsertRegion(hex.region!, { lore: e.target.value || undefined })} />
            </Field>
          )}
        </>
      )}
    </aside>
  )
}
