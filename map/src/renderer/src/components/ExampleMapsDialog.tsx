import { useState, useEffect } from 'react'
import type { MapData } from '../types/map'
import { fileIO, type ExampleMeta } from '../lib/fileIO'

interface Props {
  onClose: () => void
  onLoad: (data: MapData, id: string) => void
}

export function ExampleMapsDialog({ onClose, onLoad }: Props) {
  const [examples, setExamples] = useState<ExampleMeta[]>([])
  const [loading,  setLoading]  = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    fileIO.listExamples().then(setExamples)
  }, [])

  async function handleLoad(id: string) {
    setLoading(id)
    setError(null)
    try {
      const result = await fileIO.loadExample(id)
      if (result.error) { setError(result.error); return }
      if (!result.canceled && result.data) {
        onLoad(JSON.parse(result.data) as MapData, result.filePath ?? `__example__${id}`)
        onClose()
      }
    } catch {
      setError('Failed to parse example map.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 w-[560px] max-h-[80vh] flex flex-col gap-4 text-gray-100">

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Example Maps</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        <p className="text-sm text-gray-400">
          Ready-made worlds to explore or use as a starting point for your own.
        </p>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 rounded px-3 py-2">{error}</p>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3">
          {examples.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No examples available.</p>
          ) : (
            examples.map(ex => (
              <div key={ex.id} className="bg-gray-800 rounded-lg p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm mb-1">{ex.name}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{ex.description}</p>
                </div>
                <button
                  onClick={() => handleLoad(ex.id)}
                  disabled={loading === ex.id}
                  className="shrink-0 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 rounded px-3 py-1.5 mt-0.5"
                >
                  {loading === ex.id ? 'Loading…' : 'Load'}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="pt-2 border-t border-gray-800 flex justify-end">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-3 py-2">
            Close
          </button>
        </div>

      </div>
    </div>
  )
}
