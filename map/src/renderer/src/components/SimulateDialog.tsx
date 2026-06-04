import { useState } from 'react'

type SimType = 'clashvergence' | 'claudevergence'

interface Props {
  initialFactionCount: number
  initialSimType: SimType
  initialSeed: string
  isAzhoraMap: boolean
  onStartNew: (factionCount: number, simType: SimType, seed: string) => void
  onLoadSaved: () => void
  onClose: () => void
}

type ScenarioMode = 'azhora' | 'random'

const AZHORA_FACTION_COUNT = 9
const AZHORA_SIM_TYPE: SimType = 'clashvergence'
const FACTION_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9]

export function SimulateDialog({ initialFactionCount, initialSimType, initialSeed, isAzhoraMap, onStartNew, onLoadSaved, onClose }: Props) {
  const [scenario, setScenario] = useState<ScenarioMode>(isAzhoraMap ? 'azhora' : 'random')
  const [azhoraFactionCount, setAzhoraFactionCount] = useState(AZHORA_FACTION_COUNT)
  const [azhoraSeed, setAzhoraSeed] = useState(initialSeed)
  const [factionCount, setFactionCount] = useState(initialFactionCount)
  const [simType, setSimType]     = useState<SimType>(initialSimType)
  const [seed, setSeed]           = useState(initialSeed)

  function handleStart() {
    if (scenario === 'azhora') {
      onStartNew(azhoraFactionCount, AZHORA_SIM_TYPE, azhoraSeed)
    } else {
      onStartNew(factionCount, simType, seed)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6 flex flex-col gap-5" style={{ width: 380 }}>
        <h2 className="text-base font-semibold text-gray-100">Start Simulation</h2>

        {/* Scenario selection */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-400 uppercase tracking-wider">Scenario</label>

          {/* Azhora Starting Scenario — only for the Azhora map */}
          {isAzhoraMap && (
            <button
              type="button"
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                scenario === 'azhora'
                  ? 'border-indigo-500 bg-indigo-900/40 text-gray-100'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
              }`}
              onClick={() => setScenario('azhora')}
            >
              <div className="text-sm font-medium">Azhora Starting Scenario</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Clashvergence · historical cultures and starting positions
              </div>
            </button>
          )}

          {/* Set Start Conditions */}
          <button
            type="button"
            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
              scenario === 'random'
                ? 'border-indigo-500 bg-indigo-900/40 text-gray-100'
                : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
            }`}
            onClick={() => setScenario('random')}
          >
            <div className="text-sm font-medium">Set Start Conditions</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Configure engine, faction count, and seed freely
            </div>
          </button>
        </div>

        {/* Azhora scenario controls */}
        {scenario === 'azhora' && (
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3">
            <label className="text-sm text-gray-300 shrink-0">Factions</label>
            <select
              className="min-w-0 px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-sm"
              value={azhoraFactionCount}
              onChange={(e) => setAzhoraFactionCount(Number(e.target.value))}
            >
              {FACTION_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            <label className="text-sm text-gray-300 shrink-0">Seed</label>
            <input
              className="min-w-0 px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-sm"
              value={azhoraSeed}
              onChange={(e) => setAzhoraSeed(e.target.value)}
              placeholder="azhora-calibration-003"
            />
          </div>
        )}

        {/* Random-mode controls */}
        {scenario === 'random' && (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider">Engine</label>
              <div className="flex flex-col gap-1.5">
                {([
                  { value: 'clashvergence' as SimType, label: 'Clashvergence', desc: 'Geopolitical conquest — factions expand, attack, and develop regions.' },
                  { value: 'claudevergence' as SimType, label: 'Claudevergence', desc: 'Cultural diffusion — traditions spread influence through contact and prestige.' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      simType === opt.value
                        ? 'border-indigo-500 bg-indigo-900/40 text-gray-100'
                        : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                    }`}
                    onClick={() => setSimType(opt.value)}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-300 shrink-0">
                {simType === 'claudevergence' ? 'Traditions' : 'Factions'}
              </label>
              <select
                className="flex-1 px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-200 text-sm"
                value={factionCount}
                onChange={(e) => setFactionCount(Number(e.target.value))}
              >
                {FACTION_OPTIONS.map((n) => (
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
          </>
        )}

        <button
          className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
          onClick={handleStart}
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
