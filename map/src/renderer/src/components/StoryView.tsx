import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useMapStore } from '../store/mapStore'
import { generateMap, generateRegions, MapGenConfig } from '../lib/mapgen'
import { TERRAIN_COLORS } from '../lib/terrain'

interface Props {
  onComplete: (numFactions: number, worldName: string) => void
}

// ── Step data ─────────────────────────────────────────────────────────────────

type ConfigPatch = Partial<Omit<MapGenConfig, 'seed' | 'numRegions'>>

interface Choice {
  label:  string
  detail: string
  patch:  ConfigPatch
}

interface ChoiceStep {
  title:   string
  prose:   string
  choices: Choice[]
}

const CHOICE_STEPS: ChoiceStep[] = [
  {
    title: 'The Shape',
    prose: 'The waters recede. Beneath them, the land reveals itself. Where does the earth hold together, and where does the sea cut between?',
    choices: [
      { label: 'One Great Continent', detail: 'A single vast landmass. Factions share borders across a connected world.',
        patch: { width: 255, height: 178, hexSize: 10, seaLevel: 0.38, islandFalloff: 0.15, featureScale: 1.3 } },
      { label: 'A Scattered Realm',   detail: 'Islands and coastal reaches divided by open water. Sea routes matter as much as roads.',
        patch: { width: 205, height: 143, hexSize: 12, seaLevel: 0.56, islandFalloff: 0.82, featureScale: 0.70 } },
      { label: 'Two Landmasses',      detail: 'A divided world. Great ocean between the powers.',
        patch: { width: 310, height: 217, hexSize: 10, seaLevel: 0.44, islandFalloff: 0.22, featureScale: 2.00 } },
    ],
  },
  {
    title: 'The Bones',
    prose: 'The deep stone pushes through the skin of the world. Where does it rise, and how sharply?',
    choices: [
      { label: 'High and Sharp',  detail: 'Great ridges cut the land into natural kingdoms. Passes are few and strategic.',
        patch: { mountainRate: 0.58, highlandRate: 0.16, erosion: 0.12 } },
      { label: 'Ancient Hills',   detail: 'Old, worn terrain. Barriers are softer — crossable for centuries.',
        patch: { mountainRate: 0.22, highlandRate: 0.38, erosion: 0.35 } },
      { label: 'Open Plains',     detail: 'Flat and unbroken. No natural borders. Every frontier will be contested.',
        patch: { mountainRate: 0.12, highlandRate: 0.10, erosion: 0.52 } },
    ],
  },
  {
    title: 'The Sky',
    prose: 'The air settles. It carries heat or cold, rain or dust. What is the character of the sky above this world?',
    choices: [
      { label: 'Warm and Fertile',  detail: 'Rich soil, long growing seasons. Population grows, and with it, ambition.',
        patch: { temperature: 0.65, moisture: 0.60, polarGradient: 0.25 } },
      { label: 'Cold and Hard',     detail: 'Short summers, long winters. The peoples who survive here will be resilient.',
        patch: { temperature: 0.22, moisture: 0.42, polarGradient: 0.62 } },
      { label: 'Dry and Open',      detail: 'Steppe and arid plains. Horses, herds, and caravans will define wealth.',
        patch: { temperature: 0.58, moisture: 0.22, polarGradient: 0.30 } },
      { label: 'Storm to Sun',      detail: 'Peaks are frozen while lowlands burn. Every region has its own character.',
        patch: { temperature: 0.50, moisture: 0.50, polarGradient: 0.78 } },
    ],
  },
  {
    title: 'The Peoples',
    prose: 'From the silent places, the first fires appear. How many peoples will contend for what has been laid here?',
    choices: [
      { label: 'Three Great Powers', detail: 'Fewer, stronger factions. Every war will reshape the map.',     patch: {} },
      { label: 'Six Rivals',         detail: 'A balance of powers. Shifting alliances, no clear hegemon.',   patch: {} },
      { label: 'Nine Peoples',       detail: 'A fragmented world. History will be layered and complicated.', patch: {} },
    ],
  },
]

const NUM_FACTIONS = [3, 6, 9]

const DEFAULT_BASE: Omit<MapGenConfig, 'seed' | 'numRegions'> = {
  width: 255, height: 178, hexSize: 10,
  seaLevel: 0.44, featureScale: 1.20,
  islandFalloff: 0.30, erosion: 0.25,
  mountainRate: 0.30, highlandRate: 0.20,
  temperature: 0.50, moisture: 0.50, polarGradient: 0.40,
}

const MINIMAP_MAX_W = 290

// ── Component ─────────────────────────────────────────────────────────────────

// step 0 = name, steps 1-4 = CHOICE_STEPS[0-3], step 5 = final
export function StoryView({ onComplete }: Props) {
  const newMap = useMapStore((s) => s.newMap)

  const [step,      setStep]      = useState(0)
  const [worldName, setWorldName] = useState('')
  const [choices,   setChoices]   = useState<(number | null)[]>([null, null, null, null])
  const [seed]                    = useState(() => Math.floor(Math.random() * 99999))
  const canvasRef                 = useRef<HTMLCanvasElement>(null)

  // Derived config from accumulated choices
  const config = useMemo<MapGenConfig>(() => {
    const base = { ...DEFAULT_BASE }
    choices.slice(0, 3).forEach((ci, si) => {
      if (ci !== null) Object.assign(base, CHOICE_STEPS[si].choices[ci].patch)
    })
    const numRegions = Math.max(5, Math.round(Math.sqrt(base.width * base.height * (1 - base.seaLevel)) * 0.5))
    return { ...base, seed, numRegions }
  }, [choices, seed])

  const numFactions = choices[3] !== null ? NUM_FACTIONS[choices[3]] : 6

  // Minimap rendering
  const renderMinimap = useCallback((cfg: MapGenConfig) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const px = Math.max(1, Math.min(4, Math.floor(MINIMAP_MAX_W / cfg.width)))
    canvas.width  = cfg.width  * px
    canvas.height = cfg.height * px
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const hexes = generateMap(cfg)
    for (const hex of Object.values(hexes)) {
      const col = hex.q + Math.floor(hex.r / 2)
      ctx.fillStyle = TERRAIN_COLORS[hex.terrain]
      ctx.fillRect(col * px, hex.r * px, px, px)
    }
  }, [])

  useEffect(() => { renderMinimap(config) }, [config, renderMinimap])

  // Navigation
  const choiceIndex = step - 1  // which CHOICE_STEPS entry we're on (step 1 → index 0)
  const currentChoiceStep = choiceIndex >= 0 && choiceIndex < 4 ? CHOICE_STEPS[choiceIndex] : null
  const canAdvance =
    step === 0 ? worldName.trim().length > 0 :
    step <= 4  ? choices[choiceIndex] !== null :
    true

  function advance() {
    if (step < 5) setStep(s => s + 1)
  }

  function back() {
    if (step > 0) setStep(s => s - 1)
  }

  function selectChoice(ci: number) {
    setChoices(prev => { const next = [...prev]; next[choiceIndex] = ci; return next })
  }

  function beginSimulation() {
    const hexes = generateMap(config)
    const { hexes: rHexes, regions } = generateRegions(hexes, config.numRegions, config.seed)
    newMap(worldName.trim(), config.width, config.height, config.hexSize, rHexes, regions)
    onComplete(numFactions, worldName.trim())
  }

  // ── World summary (chips shown in right panel) ──
  const summary: { label: string; value: string }[] = []
  if (choices[0] !== null) summary.push({ label: 'Shape',   value: CHOICE_STEPS[0].choices[choices[0]].label })
  if (choices[1] !== null) summary.push({ label: 'Terrain', value: CHOICE_STEPS[1].choices[choices[1]].label })
  if (choices[2] !== null) summary.push({ label: 'Climate', value: CHOICE_STEPS[2].choices[choices[2]].label })
  if (choices[3] !== null) summary.push({ label: 'Peoples', value: CHOICE_STEPS[3].choices[choices[3]].label })

  // ── Final step ────────────────────────────────────────────────────────────
  if (step === 5) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950 text-gray-100 overflow-y-auto py-12 px-6">
        <div className="flex flex-col items-center gap-8 max-w-2xl w-full">

          <div className="text-center flex flex-col gap-3">
            <h1 className="text-3xl font-semibold text-gray-100">{worldName.trim()}</h1>
            <p className="text-base text-gray-400 leading-relaxed max-w-lg mx-auto">
              The map is drawn. The peoples take their first positions. The first age has no memory yet of what will happen.
            </p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <canvas
              ref={canvasRef}
              className="rounded-lg border border-gray-700"
              style={{ imageRendering: 'pixelated', maxWidth: '100%' }}
            />
            <p className="text-xs text-gray-600">{config.width} × {config.height} hexes</p>
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            {summary.map(({ label, value }) => (
              <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-xs text-gray-200">{value}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700">
              <span className="text-xs text-gray-500">Factions</span>
              <span className="text-xs text-gray-200">{numFactions}</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              className="px-8 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-base transition-colors"
              onClick={beginSimulation}
            >
              Begin the Simulation
            </button>
            <button
              className="text-sm text-gray-600 hover:text-gray-400 transition-colors"
              onClick={back}
            >
              ← Back
            </button>
          </div>

        </div>
      </div>
    )
  }

  // ── Choice / name steps ───────────────────────────────────────────────────
  return (
    <div className="flex-1 flex overflow-hidden bg-gray-950 text-gray-100">

      {/* ── Left: narrative + choices ── */}
      <div className="flex flex-col flex-1 overflow-y-auto px-12 py-10 gap-8 min-w-0">

        {/* Progress */}
        {step > 0 && step <= 4 && (
          <div className="flex items-center gap-2">
            {CHOICE_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < step - 1 ? 'bg-indigo-500' :
                  i === step - 1 ? 'bg-indigo-400' :
                  'bg-gray-800'
                }`}
              />
            ))}
          </div>
        )}

        {/* Step content */}
        {step === 0 ? (
          <div className="flex flex-col gap-6 max-w-lg">
            <div className="flex flex-col gap-3">
              <p className="text-xs uppercase tracking-widest text-gray-600">Prologue</p>
              <p className="text-xl text-gray-300 leading-relaxed">
                Before anything else, there is a name.
              </p>
              <p className="text-base text-gray-400 leading-relaxed">
                What will this world be called?
              </p>
            </div>
            <input
              autoFocus
              className="bg-transparent border-0 border-b border-gray-600 focus:border-indigo-400 outline-none text-2xl text-gray-100 pb-2 transition-colors placeholder-gray-700 max-w-sm"
              placeholder="Azhora…"
              value={worldName}
              onChange={(e) => setWorldName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canAdvance) advance() }}
            />
          </div>
        ) : currentChoiceStep ? (
          <div className="flex flex-col gap-7 max-w-lg">
            <div className="flex flex-col gap-3">
              <p className="text-xs uppercase tracking-widest text-gray-600">
                Step {step} of 4
              </p>
              <h2 className="text-2xl font-semibold text-gray-100">{currentChoiceStep.title}</h2>
              <p className="text-base text-gray-400 leading-relaxed">{currentChoiceStep.prose}</p>
            </div>

            <div className="flex flex-col gap-2">
              {currentChoiceStep.choices.map((choice, ci) => (
                <button
                  key={ci}
                  type="button"
                  onClick={() => selectChoice(ci)}
                  className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                    choices[choiceIndex] === ci
                      ? 'border-indigo-500 bg-indigo-900/30 text-gray-100'
                      : 'border-gray-800 bg-gray-900 hover:border-gray-600 text-gray-300'
                  }`}
                >
                  <div className="text-sm font-medium">{choice.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{choice.detail}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Navigation */}
        <div className="flex items-center gap-4 mt-auto pt-4">
          {step > 0 && (
            <button
              className="text-sm text-gray-600 hover:text-gray-400 transition-colors"
              onClick={back}
            >
              ← Back
            </button>
          )}
          <button
            className={`ml-auto px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              canAdvance
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
            disabled={!canAdvance}
            onClick={advance}
          >
            {step === 0 ? 'Name this World →' : step === 4 ? 'See the Map →' : 'Continue →'}
          </button>
        </div>

      </div>

      {/* ── Divider ── */}
      <div className="w-px bg-gray-800 shrink-0" />

      {/* ── Right: minimap + summary ── */}
      <div className="w-80 shrink-0 flex flex-col items-center gap-6 px-8 py-10 overflow-y-auto">

        <div className="flex flex-col items-center gap-3 w-full">
          <p className="text-xs uppercase tracking-widest text-gray-600 self-start">Preview</p>
          <canvas
            ref={step < 5 ? canvasRef : undefined}
            className="rounded border border-gray-800"
            style={{ imageRendering: 'pixelated', maxWidth: '100%' }}
          />
          <p className="text-xs text-gray-700">{config.width} × {config.height}</p>
        </div>

        {(worldName.trim() || summary.length > 0) && (
          <div className="flex flex-col gap-2 w-full">
            <p className="text-xs uppercase tracking-widest text-gray-600">Your World</p>
            {worldName.trim() && (
              <p className="text-sm text-gray-300 font-medium">{worldName.trim()}</p>
            )}
            {summary.map(({ label, value }) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-gray-600">{label}</span>
                <span className="text-gray-400">{value}</span>
              </div>
            ))}
          </div>
        )}

      </div>

    </div>
  )
}
