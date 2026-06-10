import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useMapStore } from '../store/mapStore'
import { TERRAIN_LABELS } from '../lib/terrain'
import { getClimateCodeLabel } from '../lib/climate'
import { TUTORIAL_STEPS, type TutorialCompletionState } from '../lib/tutorialSteps'
import type { TerrainType } from '../types/map'

const OCEAN_TYPES = new Set<TerrainType>(['ocean', 'coast', 'lake'])

interface Props {
  stepIndex: number
  onNext: () => void
  onBack: () => void
  onExit: () => void
  visible: boolean
}

export function TutorialPanel({ stepIndex, onNext, onBack, onExit, visible }: Props) {
  const step = TUTORIAL_STEPS[stepIndex]
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1

  // ── Store subscriptions ───────────────────────────────────────────────────
  const map              = useMapStore((s) => s.map)
  const selectedHexKey   = useMapStore((s) => s.selectedHex)
  const selectedRegionId = useMapStore((s) => s.selectedRegion)
  const isSimulating     = useMapStore((s) => s.isSimulating)
  const simWorld         = useMapStore((s) => s.simWorld)
  const currentPath      = useMapStore((s) => s.currentFilePath)
  const setLayer         = useMapStore((s) => s.setLayer)
  const setTool          = useMapStore((s) => s.setTool)
  const setSelectMode    = useMapStore((s) => s.setSelectMode)

  // ── Resolved data from keys ───────────────────────────────────────────────
  const selectedHex    = selectedHexKey ? (map?.hexes[selectedHexKey] ?? null) : null
  const selectedRegion = selectedRegionId ? (map?.regions[selectedRegionId] ?? null) : null

  // ── Per-step local state ──────────────────────────────────────────────────
  const [terrainsExplored, setTerrainsExplored] = useState<Set<TerrainType>>(new Set())
  const [simStartTurn, setSimStartTurn] = useState(0)
  const simTurn = simWorld?.turn ?? 0

  // ── Apply layers & tool on step entry ────────────────────────────────────
  useEffect(() => {
    const layers = step.layers
    for (const [key, val] of Object.entries(layers) as [keyof typeof layers, boolean][]) {
      setLayer(key, val)
    }
    setTool('select')
    setSelectMode(step.selectMode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex])

  // ── Track terrain exploration (step 2) ───────────────────────────────────
  useEffect(() => {
    if (step.id !== 'terrain') return
    if (!selectedHex || OCEAN_TYPES.has(selectedHex.terrain)) return
    setTerrainsExplored(prev => {
      const next = new Set(prev)
      next.add(selectedHex.terrain)
      return next
    })
  }, [selectedHex, step.id])

  // ── Record sim start turn (step 8) ───────────────────────────────────────
  const hasSetStartTurn = useRef(false)
  useEffect(() => {
    if (step.id !== 'watch') return
    if (hasSetStartTurn.current) return
    hasSetStartTurn.current = true
    setSimStartTurn(simWorld?.turn ?? 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  // ── Reset per-step state when step changes ────────────────────────────────
  useEffect(() => {
    setTerrainsExplored(new Set())
    hasSetStartTurn.current = false
  }, [stepIndex])

  // ── Completion check ──────────────────────────────────────────────────────
  const completionState: TutorialCompletionState = {
    selectedHex,
    selectedRegion,
    selectedRegionId,
    isSimulating,
    simTurn,
    currentPath,
    terrainsExplored,
    simStartTurn,
  }
  const isComplete = step.isComplete(completionState)

  // ── Region terrain/settlement stats ──────────────────────────────────────
  const regionStats = useMemo(() => {
    if (!selectedRegionId || !map) return null
    const terrainCounts: Partial<Record<TerrainType, number>> = {}
    const settlements: string[] = []
    for (const hex of Object.values(map.hexes)) {
      if (hex.region !== selectedRegionId) continue
      terrainCounts[hex.terrain] = (terrainCounts[hex.terrain] ?? 0) + 1
      if (hex.settlement) settlements.push(hex.settlement)
    }
    const terrainEntries = (Object.entries(terrainCounts) as [TerrainType, number][])
      .sort((a, b) => b[1] - a[1])
    return { terrainEntries, settlements }
  }, [selectedRegionId, map])

  // ── Step 7 sub-step state ─────────────────────────────────────────────────
  const isSaved = currentPath !== null && !currentPath.startsWith('__')

  // ── Handle advance ────────────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    if (isLast) { onExit(); return }
    if (isComplete) onNext()
  }, [isLast, isComplete, onNext, onExit])

  return (
    <div
      className={`flex flex-col h-full bg-gray-900 border-l border-gray-800 transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ width: '40%', minWidth: 320, maxWidth: 480 }}
    >
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
        <p className="text-xs text-indigo-400 font-medium uppercase tracking-widest mb-1">{step.eyebrow}</p>
        <h2 className="text-lg font-semibold text-white">{step.title}</h2>

        {/* Progress dots */}
        <div className="flex gap-1.5 mt-3">
          {TUTORIAL_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < stepIndex  ? 'bg-indigo-500' :
                i === stepIndex ? 'bg-indigo-400' :
                'bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── Prose ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 min-h-0">
        {step.prose.map((para, i) => (
          <p key={i} className="text-sm text-gray-300 leading-relaxed">{para}</p>
        ))}

        {/* ── Selected hex context ── */}
        {selectedHex && step.selectMode === 'tile' && (
          <div className="mt-2 rounded-lg bg-gray-800 px-4 py-3 flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Selected Hex</p>
            <p className="text-sm text-gray-100">
              <span className="font-medium">{TERRAIN_LABELS[selectedHex.terrain] ?? selectedHex.terrain}</span>
              {selectedHex.climate && (
                <span className="text-gray-400 ml-2">· {selectedHex.climate} – {getClimateCodeLabel(selectedHex.climate)}</span>
              )}
            </p>
            {selectedHex.region && map?.regions[selectedHex.region] && (
              <p className="text-xs text-gray-400">
                Region: <span className="text-gray-300">{map.regions[selectedHex.region].name}</span>
              </p>
            )}
          </div>
        )}

        {/* ── Selected region context ── */}
        {selectedRegion && step.selectMode === 'region' && (
          <div className="mt-2 rounded-lg bg-gray-800 px-4 py-3 flex flex-col gap-2">
            {/* Name + colour swatch */}
            <div className="flex items-center gap-2">
              {selectedRegion.color && (
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: selectedRegion.color }} />
              )}
              <p className="text-sm font-semibold text-gray-100">{selectedRegion.name}</p>
            </div>

            <div className="flex flex-col gap-1">
              {/* Climate */}
              {selectedRegion.climate && (
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-xs text-gray-500 shrink-0">Climate</span>
                  <span className="text-xs text-gray-200 text-right">
                    {getClimateCodeLabel(selectedRegion.climate)}
                    <span className="text-gray-500 ml-1">({selectedRegion.climate})</span>
                  </span>
                </div>
              )}

              {/* Faction */}
              {selectedRegion.faction && map?.factions?.[selectedRegion.faction] && (
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-xs text-gray-500 shrink-0">Faction</span>
                  <span className="text-xs text-gray-200">{map.factions[selectedRegion.faction].name}</span>
                </div>
              )}

              {/* Core status */}
              {selectedRegion.coreStatus && (
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-xs text-gray-500 shrink-0">Status</span>
                  <span className="text-xs text-gray-200 capitalize">{selectedRegion.coreStatus}</span>
                </div>
              )}
            </div>

            {/* Terrain breakdown */}
            {regionStats && regionStats.terrainEntries.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Terrain</p>
                <div className="flex flex-wrap gap-1.5">
                  {regionStats.terrainEntries.map(([type, count]) => (
                    <span
                      key={type}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-700 text-xs text-gray-300"
                    >
                      {TERRAIN_LABELS[type] ?? type}
                      <span className="text-gray-500">×{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Settlements */}
            {regionStats && regionStats.settlements.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  {regionStats.settlements.length === 1 ? 'Settlement' : 'Settlements'}
                </p>
                <p className="text-xs text-gray-300">{regionStats.settlements.join(', ')}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: terrain counter ── */}
        {step.id === 'terrain' && (
          <div className="rounded-lg bg-gray-800 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">Terrain types clicked</p>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs ${
                      terrainsExplored.size > i
                        ? 'border-indigo-400 bg-indigo-500/30 text-indigo-300'
                        : 'border-gray-600 text-gray-600'
                    }`}
                  >
                    {terrainsExplored.size > i ? '✓' : i + 1}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                {terrainsExplored.size} / 3
                {terrainsExplored.size > 0 && ` — ${Array.from(terrainsExplored).map(t => TERRAIN_LABELS[t] ?? t).join(', ')}`}
              </p>
            </div>
          </div>
        )}

        {/* ── Step 7: save + simulate checklist ── */}
        {step.id === 'simulate' && (
          <div className="rounded-lg bg-gray-800 px-4 py-3 flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Progress</p>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs shrink-0 ${isSaved ? 'border-green-400 bg-green-500/20 text-green-300' : 'border-gray-600 text-gray-500'}`}>
                {isSaved ? '✓' : '1'}
              </div>
              <p className={`text-xs ${isSaved ? 'text-green-300' : 'text-gray-400'}`}>
                Save the map <span className="text-gray-500">(Ctrl+S or click Save)</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs shrink-0 ${isSimulating ? 'border-green-400 bg-green-500/20 text-green-300' : isSaved ? 'border-gray-500 text-gray-400' : 'border-gray-700 text-gray-600'}`}>
                {isSimulating ? '✓' : '2'}
              </div>
              <p className={`text-xs ${isSimulating ? 'text-green-300' : isSaved ? 'text-gray-400' : 'text-gray-600'}`}>
                Click <span className="font-medium">Simulate</span> in the header bar
              </p>
            </div>
          </div>
        )}

        {/* ── Step 8: turn counter ── */}
        {step.id === 'watch' && isSimulating && (
          <div className="rounded-lg bg-gray-800 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Turns advanced</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-700 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((simTurn - simStartTurn) / 5) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 shrink-0">{Math.max(0, simTurn - simStartTurn)} / 5</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Action prompt ── */}
      {!isComplete && (
        <div className="mx-4 mb-3 rounded-lg bg-indigo-950/60 border border-indigo-800/40 px-4 py-3">
          <p className="text-xs text-indigo-300 leading-relaxed">
            <span className="font-semibold text-indigo-200">Action: </span>
            {step.action}
          </p>
        </div>
      )}
      {isComplete && !isLast && (
        <div className="mx-4 mb-3 rounded-lg bg-green-950/50 border border-green-800/30 px-4 py-2.5">
          <p className="text-xs text-green-300">Done — click <span className="font-semibold">Next</span> to continue.</p>
        </div>
      )}

      {/* ── Navigation ── */}
      <div className="px-5 pb-5 pt-2 flex items-center justify-between shrink-0 border-t border-gray-800">
        <button
          onClick={onBack}
          disabled={stepIndex === 0}
          className="px-3 py-1.5 text-sm rounded text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          ← Back
        </button>

        <button
          onClick={handleNext}
          disabled={!isComplete && !isLast}
          className={`px-5 py-1.5 text-sm rounded font-medium transition-colors ${
            isComplete || isLast
              ? isLast
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isLast ? 'Finish' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
