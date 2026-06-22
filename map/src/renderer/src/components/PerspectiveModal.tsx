import { useState } from 'react'
import { useMapStore } from '../store/mapStore'
import type { ChroniclePerspec } from '../types/map'

export function PerspectiveModal() {
  const pendingPrompt         = useMapStore((s) => s.chroniclePendingPrompt)
  const currentPerspec        = useMapStore((s) => s.chroniclePerspective)
  const setChroniclePrompt    = useMapStore((s) => s.setChroniclePrompt)
  const setChroniclePerspec   = useMapStore((s) => s.setChroniclePerspec)
  const simWorld              = useMapStore((s) => s.simWorld)
  const setSimWorld           = useMapStore((s) => s.setSimWorld)
  const setSimDetailSelection = useMapStore((s) => s.setSimDetailSelection)
  const chronicle             = useMapStore((s) => s.chronicle)
  const chronicleInterval     = useMapStore((s) => s.chronicleInterval)
  const setChronicleGenerating = useMapStore((s) => s.setChronicleGenerating)
  const addChronicleEntry     = useMapStore((s) => s.addChronicleEntry)
  const [error, setError]     = useState<string | null>(null)

  if (!pendingPrompt || !simWorld) return null

  const icon = pendingPrompt.type === 'splinter' ? '⚡' : '🌊'
  const title = pendingPrompt.type === 'splinter'
    ? 'A new people emerges'
    : 'New arrivals'

  async function choose(newPerspec: ChroniclePerspec | null) {
    setError(null)
    let worldForChronicle = simWorld!
    if (window.electronAPI?.sim?.setPerspective) {
      const result = await window.electronAPI.sim.setPerspective(newPerspec?.factionName ?? null)
      if ((result as any).ok === false) {
        setError((result as any).error ?? 'Could not switch perspective.')
        return
      }
      worldForChronicle = result as any
      setSimWorld(worldForChronicle as any)
      setSimDetailSelection(
        newPerspec
          ? { type: 'faction', factionName: newPerspec.factionName }
          : null,
      )
    }

    setChroniclePerspec(newPerspec)
    setChroniclePrompt(null)

    // Generate chronicle if we just hit an interval boundary
    if (worldForChronicle.turn > 0 && worldForChronicle.turn % chronicleInterval === 0 && window.electronAPI?.chronicle) {
      setChronicleGenerating(true)
      const perspFaction = newPerspec
        ? worldForChronicle.factions.find(f => f.name === newPerspec.factionName) ?? null
        : null
      const params = {
        turnStart: worldForChronicle.turn - chronicleInterval,
        turnEnd: worldForChronicle.turn,
        turnLabel: worldForChronicle.turn_label,
        currentFactions: worldForChronicle.factions,
        prevFactions: worldForChronicle.factions,
        recentEvents: worldForChronicle.recent_events ?? [],
        perspective: newPerspec?.factionName ?? null,
        perspectiveFaction: perspFaction,
        previousEntries: chronicle.slice(0, 2),
      }
      const result = await window.electronAPI.chronicle.generate(params)
      setChronicleGenerating(false)
      if (result.ok && result.text) {
        addChronicleEntry({
          id: crypto.randomUUID(),
          turnStart: worldForChronicle.turn - chronicleInterval,
          turnEnd: worldForChronicle.turn,
          turnLabel: worldForChronicle.turn_label,
          perspective: newPerspec?.factionName ?? null,
          perspectiveLabel: newPerspec?.displayName ?? 'Impartial Chronicler',
          perspectiveLanguage: newPerspec?.languageFamily,
          text: result.text,
          generatedAt: Date.now(),
        })
      }
    }
  }

  const newFactionPerspec: ChroniclePerspec = {
    factionName: pendingPrompt.factionName,
    displayName: pendingPrompt.displayName,
    languageFamily: pendingPrompt.languageFamily,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-7 flex flex-col gap-5"
        style={{ width: 420, maxWidth: '90vw' }}
      >
        <div className="flex flex-col gap-1">
          <div className="text-xs text-gray-500 uppercase tracking-widest">{icon} {title}</div>
          <div className="text-sm text-gray-200 leading-relaxed">{pendingPrompt.description}</div>
          {pendingPrompt.languageFamily && (
            <div className="text-xs text-indigo-400 mt-0.5">Language: {pendingPrompt.languageFamily}</div>
          )}
          {error && (
            <div className="text-xs text-red-300 mt-1">{error}</div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            className="w-full text-left px-4 py-3 rounded-lg border border-indigo-600 bg-indigo-900/40 text-gray-100 hover:bg-indigo-900/70 transition-colors"
            onClick={() => choose(newFactionPerspec)}
          >
            <div className="text-sm font-medium">Follow {pendingPrompt.displayName}</div>
            {pendingPrompt.languageFamily && (
              <div className="text-xs text-indigo-400 mt-0.5">Chronicle keeper of the {pendingPrompt.languageFamily}-speaking people</div>
            )}
          </button>

          {currentPerspec && (
            <button
              className="w-full text-left px-4 py-3 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600 transition-colors"
              onClick={() => choose(currentPerspec)}
            >
              <div className="text-sm font-medium">Stay with {currentPerspec.displayName}</div>
              {currentPerspec.languageFamily && (
                <div className="text-xs text-gray-500 mt-0.5">{currentPerspec.languageFamily}-speaking</div>
              )}
            </button>
          )}

          <button
            className="w-full text-left px-4 py-3 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600 transition-colors"
            onClick={() => choose(null)}
          >
            <div className="text-sm font-medium">Switch to Impartial Chronicler</div>
            <div className="text-xs text-gray-500 mt-0.5">View all peoples without bias</div>
          </button>
        </div>
      </div>
    </div>
  )
}
