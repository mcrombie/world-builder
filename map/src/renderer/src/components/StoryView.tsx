import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useMapStore } from '../store/mapStore'
import { generateMap, generateRegions, MapGenConfig } from '../lib/mapgen'
import { TERRAIN_COLORS } from '../lib/terrain'

interface Props {
  onComplete: (numFactions: number, worldName: string) => void
}

// ── Data types ────────────────────────────────────────────────────────────────

type ConfigPatch = Partial<Omit<MapGenConfig, 'seed' | 'numRegions'>>

interface Choice {
  label:     string        // card heading
  detail:    string        // card body (visible during selection)
  chronicle: string        // sentence added to the right-panel world entry
  patch:     ConfigPatch
}

interface ChoiceStep {
  title:   string
  eyebrow: string          // small label above the title
  prose:   string          // narrative prompt
  choices: Choice[]
}

// ── Step definitions ──────────────────────────────────────────────────────────
// Parameter ownership (orthogonal — patches never clobber each other):
//   Age   → erosion
//   Shape → width, height, hexSize, seaLevel, islandFalloff, featureScale
//   Earth → mountainRate, highlandRate
//   Sky   → temperature, moisture, polarGradient
//   Peoples → numFactions (not a MapGenConfig field)

const CHOICE_STEPS: ChoiceStep[] = [
  // ── Step 1: The Age ───────────────────────────────────────────────────────
  {
    title:   'The Age',
    eyebrow: 'Step 1 of 5 — How old is this world?',
    prose:   'Before the first civilisation, before the first border dispute, the land itself had a history. How much time has the world had to settle into itself?',
    choices: [
      {
        label:   'The First Age',
        detail:  'Young by geological measure. The mountains are still sharp, the coastlines unsettled, rivers cutting new paths through stone that has not yet been softened.',
        chronicle: 'is a world in its first age — geologically young, the mountains still sharp, the coastlines still shifting',
        patch:   { erosion: 0.08 },
      },
      {
        label:   'The Middle Age',
        detail:  'Worn to its present form over many long epochs. Mountains shaped by their long tenure. Rivers established. The surface settled into the character it will hold.',
        chronicle: 'is a world in its middle age — mountains shaped by long tenure, rivers established in their valleys, the terrain settled into the character it will hold',
        patch:   { erosion: 0.26 },
      },
      {
        label:   'The Deep Age',
        detail:  'Ancient beyond the reckoning of its peoples. What were great ranges are now gentle hills. Rivers have carved wide, slow valleys. The stone remembers what stood here before.',
        chronicle: 'is an ancient world — what were once great ranges are now hills, rivers have carved their valleys wide and slow, and the stone holds the memory of what stood here before',
        patch:   { erosion: 0.55 },
      },
    ],
  },

  // ── Step 2: The Shape ─────────────────────────────────────────────────────
  {
    title:   'The Shape',
    eyebrow: 'Step 2 of 5 — Where does the land gather?',
    prose:   'The waters recede. Beneath them, the shape of the world reveals itself. Where does the earth hold together, and where does the sea cut between?',
    choices: [
      {
        label:   'One Great Continent',
        detail:  'A single vast landmass surrounded by distant sea. No natural divide separates east from west. Factions will share borders, and what happens at one edge will eventually reach the other.',
        chronicle: 'Its surface is one great connected mass. No natural divide separates east from west. What happens at one edge will eventually reach the other',
        patch:   { width: 255, height: 178, hexSize: 10, seaLevel: 0.38, islandFalloff: 0.15, featureScale: 1.30 },
      },
      {
        label:   'A Scattered Realm',
        detail:  'Land broken into islands and coastal reaches, divided by open water. The sea is highway and barrier both. Nations that master ships will master the world.',
        chronicle: 'Its land is broken into islands and coastal reaches, divided by open water. The sea is a highway and a barrier both. Nations that master ships will master the world',
        patch:   { width: 205, height: 143, hexSize: 12, seaLevel: 0.56, islandFalloff: 0.82, featureScale: 0.70 },
      },
      {
        label:   'Two Landmasses',
        detail:  'Two great continents divide the surface. Wide ocean holds them apart. What one half does, the other may not know for a generation.',
        chronicle: 'Two great continents divide its surface. Wide ocean holds them apart. What one half does, the other may not learn of for a generation',
        patch:   { width: 310, height: 217, hexSize: 10, seaLevel: 0.44, islandFalloff: 0.22, featureScale: 2.00 },
      },
    ],
  },

  // ── Step 3: The Earth ─────────────────────────────────────────────────────
  {
    title:   'The Earth',
    eyebrow: 'Step 3 of 5 — Where does the stone rise?',
    prose:   'The deep rock pushes through the skin of the world. Where does it rise, and how sharply? This will determine which valleys are habitable and which crossings are worth dying for.',
    choices: [
      {
        label:   'High and Sharp',
        detail:  'Great ridges cut the land into natural kingdoms. Passes are few and strategic. Every valley is a protected world; every ridge is a political border waiting to be enforced.',
        chronicle: 'Sharp mountain ranges cut the interior into natural provinces. The passes are few. Every valley is a sheltered world; every ridge is a political border waiting to be enforced',
        patch:   { mountainRate: 0.58, highlandRate: 0.17 },
      },
      {
        label:   'Ancient Hills',
        detail:  'Old ranges worn to their present gentleness. Barriers are real but crossable — the terrain has been lived with for long enough that its routes are well understood.',
        chronicle: 'Old ranges worn to their present gentleness give the land its texture. Barriers are real but not absolute — the terrain has been lived with long enough that its routes are well understood',
        patch:   { mountainRate: 0.22, highlandRate: 0.38 },
      },
      {
        label:   'Open Plains',
        detail:  'Flat and unbroken, offering no natural shelter and no natural border. Armies can move in any direction. Every frontier will be defended by force of arms, not geography.',
        chronicle: 'The land is flat and open, offering no natural shelter and no natural border. Armies can move in any direction. Every frontier will be defined by force of arms, not geography',
        patch:   { mountainRate: 0.12, highlandRate: 0.10 },
      },
    ],
  },

  // ── Step 4: The Sky ───────────────────────────────────────────────────────
  {
    title:   'The Sky',
    eyebrow: 'Step 4 of 5 — What does the air carry?',
    prose:   'The air above this world has settled into a character. Heat or cold, rain or dust — climate is destiny here, shaping what the land can produce and who can hold it.',
    choices: [
      {
        label:   'Warm and Fertile',
        detail:  'The sky is generous. Rain falls reliably. The growing season is long in the lowlands. Population will swell, and with it, the pressure on borders.',
        chronicle: 'The sky is generous — rain falls reliably, the growing seasons are long. Population will swell in the lowlands, and with it, the pressure on every border',
        patch:   { temperature: 0.65, moisture: 0.60, polarGradient: 0.25 },
      },
      {
        label:   'Cold and Austere',
        detail:  'Winters are long and summers brief. Only certain territories yield enough to sustain a city. Population will be sparse but the peoples shaped by this cold will be capable of extraordinary endurance.',
        chronicle: 'The winters are long and the summers brief. Only certain territories yield enough to sustain a city. Population will be sparse, but the peoples shaped by this cold will be capable of great endurance',
        patch:   { temperature: 0.22, moisture: 0.42, polarGradient: 0.62 },
      },
      {
        label:   'Dry and Open',
        detail:  'Rain is rare and precious. Steppe and arid interior are vast. Kingdoms are built around rivers, oases, and caravan roads. Those who control water control the world.',
        chronicle: 'Rain is rare and precious. The steppe and arid interior are vast. Kingdoms will be built around rivers, oases, and caravan roads — those who control water will control the world',
        patch:   { temperature: 0.58, moisture: 0.22, polarGradient: 0.30 },
      },
      {
        label:   'Storm to Sun',
        detail:  'No single sky covers this world. The northern peaks are frozen while the southern lowlands are warm. Climate is a fact of geography — every region must be understood on its own terms.',
        chronicle: 'No single sky covers this world. The northern peaks are frozen while the southern lowlands burn. Climate is a fact of geography — every region must be understood on its own terms',
        patch:   { temperature: 0.50, moisture: 0.50, polarGradient: 0.78 },
      },
    ],
  },

  // ── Step 5: The Peoples ───────────────────────────────────────────────────
  {
    title:   'The Peoples',
    eyebrow: 'Step 5 of 5 — How many voices will contend?',
    prose:   'From the silence, fires appear. The first peoples take shape. How many factions will emerge from the darkness to contest what the world has been prepared to offer?',
    choices: [
      {
        label:   'Three Great Powers',
        detail:  'Fewer, stronger factions. The world is large enough that they may not meet for some turns — but when they do, the confrontation will be decisive. Every war reshapes the map.',
        chronicle: 'Three powers will emerge from the silence. The world is large enough that they may not meet for some turns — but when they do, the confrontation will be decisive',
        patch:   {},
      },
      {
        label:   'Six Rivals',
        detail:  'A balance of powers. No single faction begins dominant. Alliances will shift, borders will move, and the balance will be maintained — or broken — by circumstance and ambition.',
        chronicle: 'Six factions will contest this world. No single power begins dominant. Alliances will shift, borders will move, and the balance will be held — or broken — by circumstance and ambition',
        patch:   {},
      },
      {
        label:   'Nine Peoples',
        detail:  'A fragmented world. Many small peoples scatter across the land. The early turns will be quiet. The later turns, when they begin to meet, will be complicated. Many small histories will unfold before the great ones become visible.',
        chronicle: 'Nine peoples will scatter across the land. The early turns will be quiet. The later turns, when they begin to meet, will be complicated — many small histories will unfold before the great ones become clear',
        patch:   {},
      },
    ],
  },
]

const NUM_FACTIONS = [3, 6, 9]

// ── Defaults (shown before any choice is made) ────────────────────────────────
const DEFAULT_BASE: Omit<MapGenConfig, 'seed' | 'numRegions'> = {
  width: 255, height: 178, hexSize: 10,
  seaLevel: 0.44, featureScale: 1.20,
  islandFalloff: 0.30, erosion: 0.26,
  mountainRate: 0.30, highlandRate: 0.20,
  temperature: 0.50, moisture: 0.50, polarGradient: 0.40,
}

// ── Simulation preview text ───────────────────────────────────────────────────
// Template-generated "what to expect" paragraph from the 3 most consequential
// choices: terrain (Earth), climate (Sky), peoples count.

const EARTH_LABELS = ['sharp mountain ranges', 'ancient hills', 'open plains'] as const
const SKY_LABELS   = ['warm and fertile', 'cold and austere', 'dry and open', 'varied storm-to-sun'] as const

const EARTH_IMPLICATIONS = [
  'Mountain passes will be the most contested territory. Whoever holds the crossings holds the trade.',
  'Terrain will slow armies but not stop them. Expect the borders to shift often.',
  'Without natural barriers, early expansion will be rapid. The map will look very different after ten turns.',
] as const

const SKY_IMPLICATIONS = [
  'Fertile lowlands will produce surpluses. Factions that settle rich farmland early will compound their advantage.',
  'Grain production will be limited and uneven. Food security will drive as many decisions as military ambition.',
  'Water and trade routes will be the primary strategic resource. Control a river and you control a kingdom.',
  'Every faction will have home-climate advantages and weaknesses. No single approach to the land will work everywhere.',
] as const

const PEOPLE_IMPLICATIONS = [
  'With three powers, each confrontation matters. Expect long periods of positioning followed by decisive wars.',
  'Six factions produce classic geopolitics — the balance of power, shifting alliances, proxy conflicts at the edges.',
  'Nine peoples means a complicated early game. Small factions will be absorbed; the survivors will be the most adaptive.',
] as const

function buildSimulationPreview(earthChoice: number | null, skyChoice: number | null, factionsChoice: number | null): string {
  if (earthChoice === null || skyChoice === null || factionsChoice === null) return ''
  const factionCount = NUM_FACTIONS[factionsChoice]
  const earthLabel = EARTH_LABELS[earthChoice]
  const skyLabel   = SKY_LABELS[skyChoice]
  return `${factionCount} ${factionCount === 3 ? 'powers' : factionCount === 6 ? 'rival factions' : 'peoples'} will open in a world defined by ${earthLabel} and a ${skyLabel} sky. ${EARTH_IMPLICATIONS[earthChoice]} ${SKY_IMPLICATIONS[skyChoice]} ${PEOPLE_IMPLICATIONS[factionsChoice]}`
}

// ── Minimap sizing ────────────────────────────────────────────────────────────
const MINIMAP_MAX_W_SIDE  = 270
const MINIMAP_MAX_W_FINAL = 420

// ── Component ─────────────────────────────────────────────────────────────────
// step 0 = name, steps 1–5 = CHOICE_STEPS[0–4], step 6 = final

export function StoryView({ onComplete }: Props) {
  const newMap = useMapStore((s) => s.newMap)

  const [step,      setStep]      = useState(0)
  const [worldName, setWorldName] = useState('')
  // choices[0..4] correspond to CHOICE_STEPS[0..4]
  const [choices,   setChoices]   = useState<(number | null)[]>([null, null, null, null, null])
  const [seed]                    = useState(() => Math.floor(Math.random() * 99999))
  const [visible,   setVisible]   = useState(true)

  const sideCanvasRef  = useRef<HTMLCanvasElement>(null)
  const finalCanvasRef = useRef<HTMLCanvasElement>(null)

  // ── Config derived from accumulated patches ───────────────────────────────
  const config = useMemo<MapGenConfig>(() => {
    const base = { ...DEFAULT_BASE }
    // Apply patches in step order (each step owns non-overlapping params)
    choices.slice(0, 5).forEach((ci, si) => {
      if (ci !== null) Object.assign(base, CHOICE_STEPS[si].choices[ci].patch)
    })
    const numRegions = Math.max(5, Math.round(Math.sqrt(base.width * base.height * (1 - base.seaLevel)) * 0.5))
    return { ...base, seed, numRegions }
  }, [choices, seed])

  const numFactions = choices[4] !== null ? NUM_FACTIONS[choices[4]] : 6

  // ── Minimap rendering ─────────────────────────────────────────────────────
  const renderTo = useCallback((canvas: HTMLCanvasElement | null, cfg: MapGenConfig, maxW: number) => {
    if (!canvas) return
    const px = Math.max(1, Math.min(4, Math.floor(maxW / cfg.width)))
    canvas.width  = cfg.width  * px
    canvas.height = cfg.height * px
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const hexes = generateMap(cfg)
    for (const hex of Object.values(hexes)) {
      ctx.fillStyle = TERRAIN_COLORS[hex.terrain]
      ctx.fillRect((hex.q + Math.floor(hex.r / 2)) * px, hex.r * px, px, px)
    }
  }, [])

  useEffect(() => {
    renderTo(sideCanvasRef.current,  config, MINIMAP_MAX_W_SIDE)
  }, [config, renderTo])

  useEffect(() => {
    if (step === 6) renderTo(finalCanvasRef.current, config, MINIMAP_MAX_W_FINAL)
  }, [step, config, renderTo])

  // ── Navigation with fade ──────────────────────────────────────────────────
  const choiceIndex = step - 1   // step 1 → CHOICE_STEPS[0], etc.
  const isFinal     = step === 6
  const isNameStep  = step === 0

  const canAdvance =
    isNameStep ? worldName.trim().length > 0 :
    !isFinal   ? choices[choiceIndex] !== null :
    true

  function goTo(next: number) {
    setVisible(false)
    setTimeout(() => { setStep(next); setVisible(true) }, 160)
  }

  function advance() { if (step < 6) goTo(step + 1) }
  function back()    { if (step > 0) goTo(step - 1) }

  function selectChoice(ci: number) {
    setChoices(prev => { const n = [...prev]; n[choiceIndex] = ci; return n })
  }

  function beginSimulation() {
    const hexes = generateMap(config)
    const { hexes: rHexes, regions } = generateRegions(hexes, config.numRegions, config.seed)
    newMap(worldName.trim(), config.width, config.height, config.hexSize, rHexes, regions)
    onComplete(numFactions, worldName.trim())
  }

  // ── Growing chronicle ─────────────────────────────────────────────────────
  // Each made choice contributes a sentence fragment to a prose entry on the right.
  const chronicles: string[] = []
  if (choices[0] !== null) chronicles.push(CHOICE_STEPS[0].choices[choices[0]].chronicle)
  if (choices[1] !== null) chronicles.push(CHOICE_STEPS[1].choices[choices[1]].chronicle)
  if (choices[2] !== null) chronicles.push(CHOICE_STEPS[2].choices[choices[2]].chronicle)
  if (choices[3] !== null) chronicles.push(CHOICE_STEPS[3].choices[choices[3]].chronicle)
  if (choices[4] !== null) chronicles.push(CHOICE_STEPS[4].choices[choices[4]].chronicle)

  // Build the chronicle paragraph:
  //   "[Name] [age-fragment]. [shape-fragment]. [earth-fragment]. [sky-fragment]. [peoples-fragment]."
  function buildChronicle(): string {
    if (!worldName.trim() || chronicles.length === 0) return ''
    const [age, shape, earth, sky, peoples] = chronicles
    const parts: string[] = []
    if (age)    parts.push(`${worldName.trim()} ${age}.`)
    if (shape)  parts.push(`${shape}.`)
    if (earth)  parts.push(`${earth}.`)
    if (sky)    parts.push(`${sky}.`)
    if (peoples) parts.push(`${peoples}.`)
    return parts.join(' ')
  }

  const chronicle = buildChronicle()

  const simulationPreview = buildSimulationPreview(choices[2], choices[3], choices[4])

  // ── Final step ────────────────────────────────────────────────────────────
  if (isFinal) {
    return (
      <div
        className="flex-1 overflow-y-auto bg-gray-950 text-gray-100"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.16s ease' }}
      >
        <div className="flex flex-col items-center gap-10 max-w-3xl mx-auto px-8 py-16">

          {/* World title */}
          <div className="text-center flex flex-col gap-2">
            <p className="text-xs uppercase tracking-widest text-gray-600">The World</p>
            <h1 className="text-5xl font-semibold text-gray-100 tracking-tight">{worldName.trim()}</h1>
          </div>

          {/* Chronicle paragraph */}
          {chronicle && (
            <p className="text-base text-gray-400 leading-8 text-center max-w-2xl font-serif italic">
              {chronicle}
            </p>
          )}

          {/* Minimap */}
          <div className="flex flex-col items-center gap-2">
            <canvas
              ref={finalCanvasRef}
              className="rounded-lg border border-gray-800 shadow-2xl"
              style={{ imageRendering: 'pixelated', maxWidth: '100%' }}
            />
            <p className="text-xs text-gray-700">{config.width} × {config.height} · {config.numRegions} regions · {numFactions} factions</p>
          </div>

          {/* Simulation preview */}
          {simulationPreview && (
            <div className="w-full border border-gray-800 rounded-lg p-5 bg-gray-900/50">
              <p className="text-xs uppercase tracking-widest text-gray-600 mb-3">What to expect</p>
              <p className="text-sm text-gray-400 leading-7">{simulationPreview}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col items-center gap-4">
            <button
              className="px-10 py-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-base transition-colors shadow-lg"
              onClick={beginSimulation}
            >
              Begin the Simulation
            </button>
            <button
              className="text-sm text-gray-600 hover:text-gray-400 transition-colors"
              onClick={back}
            >
              ← Revise
            </button>
          </div>

        </div>
      </div>
    )
  }

  // ── Choice / name steps ───────────────────────────────────────────────────
  const currentStep = choiceIndex >= 0 && choiceIndex < 5 ? CHOICE_STEPS[choiceIndex] : null

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-950 text-gray-100">

      {/* ── Left: narrative + choices ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-y-auto min-w-0">
        <div
          className="flex flex-col flex-1 px-14 py-12 gap-8"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.16s ease' }}
        >
          {/* Progress segments */}
          {!isNameStep && (
            <div className="flex items-center gap-1.5 max-w-sm">
              {CHOICE_STEPS.map((_, i) => (
                <div
                  key={i}
                  className="h-0.5 flex-1 rounded-full transition-all duration-500"
                  style={{
                    background: i < choiceIndex
                      ? 'rgb(99,102,241)'       // completed
                      : i === choiceIndex
                        ? 'rgba(99,102,241,0.6)' // current
                        : 'rgb(31,41,55)',        // upcoming
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Name step ── */}
          {isNameStep && (
            <div className="flex flex-col gap-7 max-w-md">
              <div className="flex flex-col gap-4">
                <p className="text-xs uppercase tracking-widest text-gray-600">Prologue</p>
                <p className="text-2xl text-gray-200 leading-relaxed font-light">
                  Before anything else, there is a name.
                </p>
                <p className="text-base text-gray-500 leading-relaxed">
                  Every world that has ever existed has been called something by those who live in it. What do the peoples of this world call the land beneath their feet?
                </p>
              </div>
              <div className="flex flex-col gap-2 max-w-xs">
                <input
                  autoFocus
                  className="bg-transparent border-0 border-b-2 border-gray-700 focus:border-indigo-400 outline-none text-3xl text-gray-100 pb-2 transition-colors placeholder-gray-800 font-light"
                  placeholder="Azhora…"
                  value={worldName}
                  onChange={(e) => setWorldName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canAdvance) advance() }}
                />
                {worldName.trim() && (
                  <p className="text-xs text-gray-600 italic">"{worldName.trim()}" — this name will be remembered.</p>
                )}
              </div>
            </div>
          )}

          {/* ── Choice step ── */}
          {currentStep && (
            <div className="flex flex-col gap-8 max-w-lg">
              <div className="flex flex-col gap-3">
                <p className="text-xs uppercase tracking-widest text-gray-600">{currentStep.eyebrow}</p>
                <h2 className="text-3xl font-semibold text-gray-100 tracking-tight">{currentStep.title}</h2>
                <p className="text-base text-gray-400 leading-7">{currentStep.prose}</p>
              </div>

              <div className="flex flex-col gap-2.5">
                {currentStep.choices.map((choice, ci) => {
                  const selected = choices[choiceIndex] === ci
                  return (
                    <button
                      key={ci}
                      type="button"
                      onClick={() => selectChoice(ci)}
                      className={[
                        'text-left px-5 py-4 rounded-lg border-l-2 border-r border-t border-b transition-all',
                        selected
                          ? 'border-l-indigo-500 border-r-gray-700 border-t-gray-700 border-b-gray-700 bg-indigo-950/40'
                          : 'border-l-gray-800 border-r-gray-800 border-t-gray-800 border-b-gray-800 bg-gray-900 hover:border-l-gray-600 hover:bg-gray-900/80',
                      ].join(' ')}
                    >
                      <div className={`text-sm font-semibold mb-1 transition-colors ${selected ? 'text-indigo-300' : 'text-gray-200'}`}>
                        {choice.label}
                      </div>
                      <div className="text-xs text-gray-500 leading-relaxed">{choice.detail}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-4 pt-2 mt-auto max-w-lg">
            {!isNameStep && (
              <button
                className="text-sm text-gray-600 hover:text-gray-400 transition-colors"
                onClick={back}
              >
                ← Back
              </button>
            )}
            <button
              className={[
                'ml-auto px-7 py-2.5 rounded-lg text-sm font-medium transition-all',
                canAdvance
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-gray-800 text-gray-700 cursor-not-allowed',
              ].join(' ')}
              disabled={!canAdvance}
              onClick={advance}
            >
              {isNameStep    ? `Enter ${worldName.trim() || 'the World'} →` :
               step === 5    ? 'Reveal the World →'                          :
               'Continue →'}
            </button>
          </div>

        </div>
      </div>

      {/* ── Divider ── */}
      <div className="w-px bg-gray-800/60 shrink-0" />

      {/* ── Right: minimap + growing chronicle ───────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col gap-6 px-7 py-12 overflow-y-auto">

        {/* Minimap */}
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-widest text-gray-700">Preview</p>
          <canvas
            ref={sideCanvasRef}
            className="rounded border border-gray-800/80 w-full"
            style={{ imageRendering: 'pixelated' }}
          />
          <p className="text-xs text-gray-800">{config.width} × {config.height}</p>
        </div>

        {/* Chronicle — grows as choices are made */}
        {chronicle ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-gray-700">Chronicle</p>
            <div className="border-l-2 border-gray-800 pl-3">
              {worldName.trim() && chronicles.length > 0 && (
                <p className="text-xs text-gray-500 leading-6 font-serif italic">
                  {chronicle}
                </p>
              )}
            </div>
          </div>
        ) : worldName.trim() ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-gray-700">Chronicle</p>
            <p className="text-xs text-gray-700 italic font-serif">{worldName.trim()}…</p>
          </div>
        ) : null}

      </div>
    </div>
  )
}
