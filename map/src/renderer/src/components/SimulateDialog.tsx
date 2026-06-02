import { useState } from 'react'

type SimType = 'clashvergence' | 'claudevergence'

interface Props {
  initialFactionCount: number
  initialSimType: SimType
  initialSeed: string
  onStartNew: (factionCount: number, simType: SimType, seed: string) => void
  onLoadSaved: () => void
  onClose: () => void
}

const SIM_OPTIONS: { value: SimType; label: string; description: string }[] = [
  {
    value: 'clashvergence',
    label: 'Clashvergence',
    description: 'Geopolitical conquest — factions expand, attack, and develop regions.',
  },
  {
    value: 'claudevergence',
    label: 'Claudevergence',
    description: 'Cultural diffusion — traditions spread influence through contact and prestige.',
  },
]

export function SimulateDialog({ initialFactionCount, initialSimType, initialSeed, onStartNew, onLoadSaved, onClose }: Props) {
  const [factionCount, setFactionCount] = useState(initialFactionCount)
  const [simType, setSimType] = useState<SimType>(initialSimType)
  const [seed, setSeed] = useState(initialSeed)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-88 p-6 flex flex-col gap-5" style={{ width: 360 }}>
        <h2 className="text-base font-semibold text-gray-100">Start Simulation</h2>

        {/* Simulation type */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-400 uppercase tracking-wider">Simulation</label>
          <div className="flex flex-col gap-2">
            {SIM_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  simType === opt.value
                    ? 'border-indigo-500 bg-indigo-900/40 text-gray-100'
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                }`}
                onClick={() => setSimType(opt.value)}
              >
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Faction / tradition count */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-300 shrink-0">
            {simType === 'claudevergence' ? 'Traditions' : 'Factions'}
          </label>
          <select
            className="flex-1 px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-sm"
            value={factionCount}
            onChange={(e) => setFactionCount(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-300 shrink-0">Seed</label>
          <input
            className="flex-1 px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-sm"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="pyrosi-isareos-1"
          />
        </div>

        <button
          className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
          onClick={() => onStartNew(factionCount, simType, seed)}
        >
          New Simulation
        </button>

        <div className="flex items-center gap-3 text-xs text-gray-600">
          <div className="flex-1 h-px bg-gray-800" />
          or
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        <button
          className="w-full px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
          onClick={onLoadSaved}
        >
          Load Saved Simulation…
        </button>

        <button
          className="text-xs text-gray-600 hover:text-gray-400 self-center"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
