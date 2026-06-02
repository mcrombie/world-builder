import { useMemo, useState, useCallback } from 'react'
import { useMapStore } from '../store/mapStore'
import { TERRAIN_LABELS, CLIMATE_LABELS, CLIMATE_COLORS, ALL_CLIMATES } from '../lib/terrain'
import { Climate, LoreEntry, RegionData, SettlementSize, CoreStatus, ViewMode } from '../types/map'
import { buildFactionColorMap } from './SimulationPanel'

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

function DominantClimateField({ regionId }: { regionId: string }) {
  const map = useMapStore((s) => s.map)
  const { dominant, total } = useMemo(() => {
    if (!map) return { dominant: null as Climate | null, total: 0 }
    const counts: Partial<Record<Climate, number>> = {}
    for (const hex of Object.values(map.hexes)) {
      if (hex.region === regionId && hex.climate) {
        counts[hex.climate] = (counts[hex.climate] ?? 0) + 1
      }
    }
    const entries = Object.entries(counts) as [Climate, number][]
    if (!entries.length) return { dominant: null as Climate | null, total: 0 }
    const tot = entries.reduce((s, [, n]) => s + n, 0)
    const dom = entries.reduce((a, b) => b[1] > a[1] ? b : a)[0]
    return { dominant: dom, total: tot }
  }, [map, regionId])

  return (
    <Field label="Dominant Climate">
      {dominant ? (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-800 rounded">
          <span className="inline-block w-3 h-3 rounded-sm border border-gray-600 shrink-0"
            style={{ background: CLIMATE_COLORS[dominant] }} />
          <span className="text-sm text-gray-200">{CLIMATE_LABELS[dominant]}</span>
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
  onChange,
}: {
  owner: SimOwner | null | undefined
  value: string
  onChange: (value: string) => void
}) {
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
  const map            = useMapStore((s) => s.map)
  const selectedHex    = useMapStore((s) => s.selectedHex)
  const selectedRegion = useMapStore((s) => s.selectedRegion)
  const updateHex      = useMapStore((s) => s.updateHex)
  const upsertRegion   = useMapStore((s) => s.upsertRegion)
  const viewMode       = useMapStore((s) => s.viewMode)
  const simWorld       = useMapStore((s) => s.simWorld)
  const panelW         = PANEL_WIDTH[viewMode]

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

  function getSimOwner(regionId: string | null | undefined): SimOwner | null {
    if (!regionId || !map) return null
    const regionName = map.regions[regionId]?.name
    return simOwners[regionId] ?? (regionName ? simOwners[regionName] : null) ?? null
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

  // ── Region-select panel (non-lore modes) ──────────────────────────────────
  if (selectedRegion && map?.regions[selectedRegion]) {
    const rd = map.regions[selectedRegion]
    const hexCount = Object.values(map.hexes).filter(h => h.region === selectedRegion).length
    const simOwner = getSimOwner(selectedRegion)

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
          onChange={(value) => upsertRegion(selectedRegion, { faction: value || undefined })}
        />
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
        <select className={SELECT} value={hex.climate}
          onChange={(e) => updateHex(selectedHex, { climate: e.target.value as Climate })}>
          {ALL_CLIMATES.map((c) => <option key={c} value={c}>{CLIMATE_LABELS[c]}</option>)}
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
            onChange={(value) => upsertRegion(hex.region!, { faction: value || undefined })}
          />
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
