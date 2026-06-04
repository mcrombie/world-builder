import { useMapStore } from '../store/mapStore'
import { FactionData, GovernmentForm, PolityTier } from '../types/map'

const INPUT  = 'w-full bg-gray-800 text-sm rounded px-2.5 py-1.5 outline-none focus:ring-1 ring-indigo-500 text-gray-100'
const SELECT = INPUT

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  )
}

const POLITY_TIERS: { value: PolityTier; label: string }[] = [
  { value: 'band',     label: 'Band' },
  { value: 'tribe',    label: 'Tribe' },
  { value: 'chiefdom', label: 'Chiefdom' },
  { value: 'state',    label: 'State' },
  { value: 'empire',   label: 'Empire' },
]

const GOVERNMENT_FORMS: { value: GovernmentForm; label: string }[] = [
  { value: 'council',   label: 'Council' },
  { value: 'leader',    label: 'Leader' },
  { value: 'monarchy',  label: 'Monarchy' },
  { value: 'oligarchy', label: 'Oligarchy' },
  { value: 'republic',  label: 'Republic' },
  { value: 'theocracy', label: 'Theocracy' },
  { value: 'military',  label: 'Military' },
]

export function FactionPanel({ factionId, panelW }: { factionId: string; panelW: string }) {
  const map           = useMapStore((s) => s.map)
  const upsertFaction = useMapStore((s) => s.upsertFaction)
  const loreFile      = useMapStore((s) => s.loreFile)

  const fd = map?.factions?.[factionId]
  if (!fd) return null

  const regionIds = Object.keys(map?.regions ?? {})
  const ownedCount = Object.keys(map?.regions ?? {}).filter(
    (rid) => map?.regions[rid].faction === factionId
  ).length

  function upd(patch: Partial<FactionData>) {
    upsertFaction(factionId, patch)
  }

  const linked = loreFile?.entries.find((e) => e.id === fd.loreRef)

  return (
    <aside className={`${panelW} bg-gray-900 text-gray-100 p-5 flex flex-col gap-4 shrink-0 overflow-y-auto border-l border-gray-800`}>
      <div>
        <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2 mb-1">
          <span className="inline-block w-3 h-3 rounded-sm border border-gray-500 shrink-0" style={{ background: fd.color }} />
          {fd.name}
        </h2>
        <p className="text-sm text-gray-500">{ownedCount} region{ownedCount !== 1 ? 's' : ''}</p>
      </div>

      <div className="h-px bg-gray-700" />

      <Field label="Name">
        <input className={INPUT} value={fd.name}
          onChange={(e) => upd({ name: e.target.value })} />
      </Field>

      <Field label="Color">
        <div className="flex items-center gap-3">
          <input type="color" className="w-9 h-9 rounded cursor-pointer bg-transparent border-0"
            value={fd.color} onChange={(e) => upd({ color: e.target.value })} />
          <span className="text-sm text-gray-400 font-mono">{fd.color}</span>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Polity Tier">
          <select className={SELECT} value={fd.polityTier}
            onChange={(e) => upd({ polityTier: e.target.value as PolityTier })}>
            {POLITY_TIERS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Government">
          <select className={SELECT} value={fd.governmentForm}
            onChange={(e) => upd({ governmentForm: e.target.value as GovernmentForm })}>
            {GOVERNMENT_FORMS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Capital Region">
        <select className={SELECT} value={fd.capital ?? ''}
          onChange={(e) => upd({ capital: e.target.value || undefined })}>
          <option value="">— none —</option>
          {regionIds.map((rid) => (
            <option key={rid} value={rid}>{map?.regions[rid]?.name ?? rid}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Starting Treasury">
          <input className={INPUT} type="number" min={0} value={fd.startingTreasury ?? ''}
            placeholder="e.g. 5"
            onChange={(e) => upd({ startingTreasury: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Primary Ethnicity">
          <input className={INPUT} value={fd.primaryEthnicity ?? ''} placeholder="e.g. Cael"
            onChange={(e) => upd({ primaryEthnicity: e.target.value || undefined })} />
        </Field>
      </div>

      <Field label="Religion">
        <input className={INPUT} value={fd.religion ?? ''} placeholder="e.g. Rites of the Caul"
          onChange={(e) => upd({ religion: e.target.value || undefined })} />
      </Field>

      {loreFile && (
        <Field label="Lore Entry">
          {linked ? (
            <div className="flex items-center justify-between gap-2 bg-gray-800 rounded px-2.5 py-1.5 text-sm">
              <span className="truncate text-indigo-300">{linked.name}</span>
              <button className="text-gray-500 hover:text-red-400 shrink-0 text-xs"
                onClick={() => upd({ loreRef: undefined })}>
                ✕
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500 italic">No lore entry linked.</p>
              <select className={SELECT} value=""
                onChange={(e) => { if (e.target.value) upd({ loreRef: e.target.value }) }}>
                <option value="">Link an entry…</option>
                {loreFile.entries.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}
        </Field>
      )}

      <Field label="Notes">
        <textarea className={`${INPUT} resize-none`} rows={5}
          value={fd.notes ?? ''} placeholder="Faction notes, history, character…"
          onChange={(e) => upd({ notes: e.target.value || undefined })} />
      </Field>
    </aside>
  )
}
