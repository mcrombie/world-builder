import { useState, useEffect, useRef } from 'react'
import { useMapStore } from '../store/mapStore'
import { HexCanvas } from './HexCanvas'
import { TutorialPanel } from './TutorialPanel'
import { TUTORIAL_STEPS } from '../lib/tutorialSteps'
import { fileIO } from '../lib/fileIO'
import type { LayerVisibility, MapData } from '../types/map'

interface Props {
  onExit: () => void
}

export function TutorialView({ onExit }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [visible,   setVisible]   = useState(true)

  const loadMap   = useMapStore((s) => s.loadMap)
  const setTool   = useMapStore((s) => s.setTool)
  const setLayer  = useMapStore((s) => s.setLayer)
  const map       = useMapStore((s) => s.map)

  // ── Save entry state so we can restore it on exit ─────────────────────────
  const savedTool   = useRef(useMapStore.getState().activeTool)
  const savedLayers = useRef<LayerVisibility>({ ...useMapStore.getState().layers })

  // ── Auto-load Azhora if no map is loaded ──────────────────────────────────
  useEffect(() => {
    if (useMapStore.getState().map) return
    fileIO.loadExample('azhora').then(result => {
      if (!result.canceled && result.data) {
        try {
          const data = JSON.parse(result.data) as MapData
          loadMap(data, result.filePath ?? '__example__azhora')
        } catch {}
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Set tool to 'select' on mount; restore on unmount ────────────────────
  useEffect(() => {
    setTool('select')
    return () => {
      setTool(savedTool.current)
      const layers = savedLayers.current
      for (const [key, val] of Object.entries(layers) as [keyof LayerVisibility, boolean][]) {
        setLayer(key, val)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Navigation with fade ──────────────────────────────────────────────────
  function goTo(next: number) {
    setVisible(false)
    setTimeout(() => { setStepIndex(next); setVisible(true) }, 160)
  }

  function handleNext() { goTo(Math.min(stepIndex + 1, TUTORIAL_STEPS.length - 1)) }
  function handleBack() { goTo(Math.max(stepIndex - 1, 0)) }

  function handleExit() {
    setTool(savedTool.current)
    const layers = savedLayers.current
    for (const [key, val] of Object.entries(layers) as [keyof LayerVisibility, boolean][]) {
      setLayer(key, val)
    }
    onExit()
  }

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Map canvas ── */}
      <main className="flex-1 relative overflow-hidden">
        {map ? (
          <HexCanvas />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Loading Azhora…
          </div>
        )}
      </main>

      {/* ── Tutorial panel ── */}
      <TutorialPanel
        stepIndex={stepIndex}
        onNext={handleNext}
        onBack={handleBack}
        onExit={handleExit}
        visible={visible}
      />
    </div>
  )
}
