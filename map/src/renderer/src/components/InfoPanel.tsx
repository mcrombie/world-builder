import { useMapStore } from '../store/mapStore'
import { TERRAIN_LABELS } from '../lib/terrain'
import { SettlementSize, Climate, CoreStatus } from '../types/map'

const SETTLEMENT_SIZES: SettlementSize[] = ['village', 'town', 'city', 'capital']
const CLIMATES: Climate[] = ['temperate', 'oceanic', 'cold', 'arid', 'steppe', 'tropical']
const CORE_STATUSES: CoreStatus[] = ['homeland', 'core', 'frontier']

export function InfoPanel() {
  const map            = useMapStore((s) => s.map)
  const selectedHex    = useMapStore((s) => s.selectedHex)
  const selectedRegion = useMapStore((s) => s.selectedRegion)
  const updateHex      = useMapStore((s) => s.updateHex)
  const upsertRegion   = useMapStore((s) => s.upsertRegion)

  // ── Region-select panel ───────────────────────────────────────────────────
  if (selectedRegion && map?.regions[selectedRegion]) {
    const rd = map.regions[selectedRegion]
    const hexCount = Object.values(map.hexes).filter(h => h.region === selectedRegion).length

    function field(label: string, content: React.ReactNode) {
      return (
        <div>
          <label className="block text-xs text-gray-400 mb-1">{label}</label>
          {content}
        </div>
      )
    }

    return (
      <aside className="w-56 bg-gray-900 text-gray-100 p-4 flex flex-col gap-3 shrink-0 overflow-y-auto">
        <h2 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-2 flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm border border-gray-500 shrink-0" style={{ background: rd.color }} />
          {rd.name}
        </h2>
        <p className="text-xs text-gray-500">{hexCount} hex{hexCount !== 1 ? 'es' : ''}</p>

        {field('Display name',
          <input
            className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
            value={rd.name}
            onChange={(e) => upsertRegion(selectedRegion, { name: e.target.value })}
          />
        )}
        {field('Color',
          <div className="flex items-center gap-2">
            <input type="color" className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              value={rd.color} onChange={(e) => upsertRegion(selectedRegion, { color: e.target.value })} />
            <span className="text-xs text-gray-400 font-mono">{rd.color}</span>
          </div>
        )}
        {field('Faction',
          <input className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
            value={rd.faction ?? ''} placeholder="e.g. Mittoli Republic"
            onChange={(e) => upsertRegion(selectedRegion, { faction: e.target.value || undefined })} />
        )}
        {field('Climate',
          <select className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
            value={rd.climate ?? ''}
            onChange={(e) => upsertRegion(selectedRegion, { climate: (e.target.value || undefined) as Climate | undefined })}>
            <option value="">— unset —</option>
            {CLIMATES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        )}
        {field('Status',
          <select className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
            value={rd.coreStatus ?? ''}
            onChange={(e) => upsertRegion(selectedRegion, { coreStatus: (e.target.value || undefined) as CoreStatus | undefined })}>
            <option value="">— unset —</option>
            {CORE_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        )}
        {field('Notes',
          <textarea className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500 resize-none"
            rows={4} value={rd.notes ?? ''} placeholder="Lore notes…"
            onChange={(e) => upsertRegion(selectedRegion, { notes: e.target.value || undefined })} />
        )}
      </aside>
    )
  }

  if (!map || !selectedHex || !map.hexes[selectedHex]) {
    return (
      <aside className="w-56 bg-gray-900 text-gray-400 p-4 flex flex-col gap-2 shrink-0">
        <p className="text-xs italic mt-2">Select a hex or region to see details.</p>
      </aside>
    )
  }

  const hex = map.hexes[selectedHex]
  const regionData = hex.region ? map.regions[hex.region] : null

  function field(label: string, content: React.ReactNode) {
    return (
      <div>
        <label className="block text-xs text-gray-400 mb-1">{label}</label>
        {content}
      </div>
    )
  }

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 p-4 flex flex-col gap-3 shrink-0 overflow-y-auto">

      {/* ── Hex ── */}
      <h2 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-2">
        Hex ({hex.q}, {hex.r})
      </h2>

      {field('Terrain', <p className="text-sm">{TERRAIN_LABELS[hex.terrain]}</p>)}

      {field('Region',
        <input
          className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
          value={hex.region ?? ''}
          placeholder="e.g. mittolo"
          onChange={(e) => updateHex(selectedHex, { region: e.target.value || undefined })}
        />
      )}

      {field('Settlement',
        <input
          className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
          value={hex.settlement ?? ''}
          placeholder="Settlement name"
          onChange={(e) => updateHex(selectedHex, { settlement: e.target.value || undefined })}
        />
      )}

      {hex.settlement && field('Size',
        <select
          className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
          value={hex.settlementSize ?? 'village'}
          onChange={(e) => updateHex(selectedHex, { settlementSize: e.target.value as SettlementSize })}
        >
          {SETTLEMENT_SIZES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      )}

      {field('Notes',
        <textarea
          className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500 resize-none"
          rows={3}
          value={hex.notes ?? ''}
          placeholder="Hex notes…"
          onChange={(e) => updateHex(selectedHex, { notes: e.target.value || undefined })}
        />
      )}

      {/* ── Region properties ── */}
      {regionData && hex.region && <>
        <div className="border-t border-gray-700 pt-2">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm border border-gray-500 shrink-0"
              style={{ background: regionData.color }}
            />
            Region: {regionData.name}
          </h3>
        </div>

        {field('Display name',
          <input
            className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
            value={regionData.name}
            onChange={(e) => upsertRegion(hex.region!, { name: e.target.value })}
          />
        )}

        {field('Color',
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              value={regionData.color}
              onChange={(e) => upsertRegion(hex.region!, { color: e.target.value })}
            />
            <span className="text-xs text-gray-400 font-mono">{regionData.color}</span>
          </div>
        )}

        {field('Faction',
          <input
            className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
            value={regionData.faction ?? ''}
            placeholder="e.g. Mittoli Republic"
            onChange={(e) => upsertRegion(hex.region!, { faction: e.target.value || undefined })}
          />
        )}

        {field('Climate',
          <select
            className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
            value={regionData.climate ?? ''}
            onChange={(e) => upsertRegion(hex.region!, { climate: (e.target.value || undefined) as Climate | undefined })}
          >
            <option value="">— unset —</option>
            {CLIMATES.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        )}

        {field('Status',
          <select
            className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500"
            value={regionData.coreStatus ?? ''}
            onChange={(e) => upsertRegion(hex.region!, { coreStatus: (e.target.value || undefined) as CoreStatus | undefined })}
          >
            <option value="">— unset —</option>
            {CORE_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        )}

        {field('Notes',
          <textarea
            className="w-full bg-gray-800 text-sm rounded px-2 py-1 outline-none focus:ring-1 ring-indigo-500 resize-none"
            rows={3}
            value={regionData.notes ?? ''}
            placeholder="Lore notes, lore/geography/regions/…"
            onChange={(e) => upsertRegion(hex.region!, { notes: e.target.value || undefined })}
          />
        )}
      </>}

    </aside>
  )
}
