import { useState } from 'react'
import { useMapStore, REGION_PALETTE } from '../store/mapStore'
import { ALL_TERRAINS, TERRAIN_COLORS, TERRAIN_LABELS } from '../lib/terrain'
import { fileIO } from '../lib/fileIO'
import { AzloreFile, Tool, LayerVisibility, RiverSize, SelectMode } from '../types/map'

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'paint',  label: 'Paint',  icon: '🖌' },
  { id: 'erase',  label: 'Erase',  icon: '⬜' },
  { id: 'river',  label: 'River',  icon: '〰️' },
  { id: 'region', label: 'Region', icon: '🗺' },
  { id: 'select', label: 'Select', icon: '🔍' },
  { id: 'pan',    label: 'Pan',    icon: '✋' },
]

const LAYER_LABELS: Record<keyof LayerVisibility, string> = {
  terrain:     'Terrain',
  grid:        'Grid',
  regions:     'Regions',
  settlements: 'Settlements',
  rivers:      'Rivers',
  underlay:    'Underlay',
  climate:     'Climate',
}

const BRUSH_SIZES = [
  { radius: 0, hexCount: 1,  dotPx: 5  },
  { radius: 1, hexCount: 7,  dotPx: 9  },
  { radius: 2, hexCount: 19, dotPx: 14 },
  { radius: 3, hexCount: 37, dotPx: 19 },
]

export function Toolbar() {
  const activeTool      = useMapStore((s) => s.activeTool)
  const activeTerrain   = useMapStore((s) => s.activeTerrain)
  const activeRiverSize = useMapStore((s) => s.activeRiverSize)
  const selectMode      = useMapStore((s) => s.selectMode)
  const brushRadius     = useMapStore((s) => s.brushRadius)
  const layers        = useMapStore((s) => s.layers)
  const activeRegion  = useMapStore((s) => s.activeRegion)
  const map           = useMapStore((s) => s.map)
  const setTool         = useMapStore((s) => s.setTool)
  const setTerrain      = useMapStore((s) => s.setTerrain)
  const setRiverSize    = useMapStore((s) => s.setRiverSize)
  const setSelectMode   = useMapStore((s) => s.setSelectMode)
  const setBrushRadius  = useMapStore((s) => s.setBrushRadius)
  const setLayer        = useMapStore((s) => s.setLayer)
  const setUnderlay     = useMapStore((s) => s.setUnderlay)
  const setActiveRegion = useMapStore((s) => s.setActiveRegion)
  const upsertRegion    = useMapStore((s) => s.upsertRegion)
  const deleteRegion    = useMapStore((s) => s.deleteRegion)

  const [newRegionName, setNewRegionName] = useState('')

  const loreFile   = useMapStore((s) => s.loreFile)
  const setLoreFile = useMapStore((s) => s.setLoreFile)

  async function chooseUnderlay() {
    const result = await fileIO.chooseImage()
    if (!result.canceled && result.dataUrl) setUnderlay(result.dataUrl)
  }

  function nextColor(): string {
    const used = Object.keys(map?.regions ?? {}).length
    return REGION_PALETTE[used % REGION_PALETTE.length]
  }

  function createRegion() {
    const name = newRegionName.trim()
    if (!name) return
    upsertRegion(name, { name, color: nextColor() })
    setActiveRegion(name)
    setNewRegionName('')
  }

  const regions = map?.regions ?? {}
  const regionIds = Object.keys(regions)

  return (
    <aside className="w-48 flex flex-col gap-4 bg-gray-900 text-gray-100 p-3 overflow-y-auto shrink-0">

      {/* Tools */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Tool</h3>
        <div className="grid grid-cols-2 gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`flex flex-col items-center py-2 rounded text-sm transition-colors
                ${activeTool === t.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="text-xs mt-1">{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Brush size — paint / erase / region */}
      {(activeTool === 'paint' || activeTool === 'erase' || activeTool === 'region') && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Brush Size</h3>
          <div className="grid grid-cols-4 gap-1">
            {BRUSH_SIZES.map(({ radius, hexCount, dotPx }) => (
              <button
                key={radius}
                onClick={() => setBrushRadius(radius)}
                title={`${hexCount} hex${hexCount > 1 ? 'es' : ''}`}
                className={`flex flex-col items-center justify-center h-11 rounded transition-colors
                  ${brushRadius === radius
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
              >
                <div className="flex items-center justify-center mb-1" style={{ height: 18 }}>
                  <div className="rounded-full bg-current" style={{ width: dotPx, height: dotPx }} />
                </div>
                <span className="text-xs leading-none">{hexCount}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Select mode */}
      {activeTool === 'select' && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Select</h3>
          <div className="flex gap-1">
            {(['tile', 'region'] as SelectMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSelectMode(mode)}
                className={`flex-1 py-1.5 rounded text-sm capitalize transition-colors
                  ${selectMode === mode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* River size */}
      {activeTool === 'river' && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">River Size</h3>
          <div className="flex flex-col gap-1">
            {(['small', 'medium', 'large'] as RiverSize[]).map((size) => {
              const barH = size === 'small' ? 2 : size === 'large' ? 6 : 4
              return (
                <button
                  key={size}
                  onClick={() => setRiverSize(size)}
                  className={`flex items-center gap-3 px-2 py-1.5 rounded text-sm transition-colors
                    ${activeRiverSize === size
                      ? 'ring-2 ring-indigo-400 bg-gray-800'
                      : 'hover:bg-gray-800'}`}
                >
                  <div className="w-8 flex items-center shrink-0">
                    <div className="w-full rounded-full bg-blue-400" style={{ height: barH }} />
                  </div>
                  <span className="capitalize">{size}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Terrain palette */}
      {(activeTool === 'paint' || activeTool === 'erase') && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Terrain</h3>
          <div className="flex flex-col gap-1">
            {ALL_TERRAINS.map((t) => (
              <button
                key={t}
                onClick={() => { setTerrain(t); setTool('paint') }}
                className={`flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors
                  ${activeTerrain === t && activeTool === 'paint'
                    ? 'ring-2 ring-indigo-400 bg-gray-800'
                    : 'hover:bg-gray-800'}`}
              >
                <span
                  className="inline-block w-4 h-4 rounded-sm border border-gray-600 shrink-0"
                  style={{ background: TERRAIN_COLORS[t] }}
                />
                <span className="truncate">{TERRAIN_LABELS[t]}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Region palette */}
      {activeTool === 'region' && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Regions</h3>
          <div className="flex flex-col gap-1 mb-2">

            <button
              onClick={() => setActiveRegion(null)}
              className={`flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors
                ${activeRegion === null ? 'ring-2 ring-indigo-400 bg-gray-800' : 'hover:bg-gray-800'}`}
            >
              <span className="inline-block w-4 h-4 rounded-sm border border-dashed border-gray-500 shrink-0" />
              <span className="truncate text-gray-400">None (erase)</span>
            </button>

            {regionIds.map((id) => {
              const rd = regions[id]
              return (
                <div key={id} className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveRegion(id)}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors flex-1 min-w-0
                      ${activeRegion === id ? 'ring-2 ring-indigo-400 bg-gray-800' : 'hover:bg-gray-800'}`}
                  >
                    <span
                      className="inline-block w-4 h-4 rounded-sm border border-gray-600 shrink-0"
                      style={{ background: rd.color }}
                    />
                    <span className="truncate">{rd.name}</span>
                  </button>
                  <button
                    onClick={() => { if (activeRegion === id) setActiveRegion(null); deleteRegion(id) }}
                    className="text-gray-600 hover:text-red-400 px-1 text-xs shrink-0"
                    title="Delete region"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>

          <div className="flex gap-1">
            <input
              className="flex-1 bg-gray-800 rounded px-2 py-1 text-xs outline-none focus:ring-1 ring-indigo-500 min-w-0"
              placeholder="New region…"
              value={newRegionName}
              onChange={(e) => setNewRegionName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createRegion() }}
            />
            <button
              onClick={createRegion}
              className="bg-indigo-600 hover:bg-indigo-500 rounded px-2 py-1 text-xs shrink-0"
            >
              +
            </button>
          </div>
        </section>
      )}

      {/* Layers */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Layers</h3>
        <div className="flex flex-col gap-1">
          {(Object.keys(LAYER_LABELS) as (keyof LayerVisibility)[]).map((key) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm hover:text-white">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(e) => setLayer(key, e.target.checked)}
                className="accent-indigo-500"
              />
              {LAYER_LABELS[key]}
            </label>
          ))}
        </div>
      </section>

      {/* Underlay image */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Underlay</h3>
        <button
          onClick={chooseUnderlay}
          className="w-full text-xs bg-gray-800 hover:bg-gray-700 rounded px-2 py-2 text-left truncate"
        >
          Choose image…
        </button>
      </section>

      {/* Lore file */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Lore</h3>
        <button
          onClick={async () => {
            const result = await (window as any).electronAPI?.lore?.load()
            if (!result || result.canceled || !result.data) return
            try {
              const parsed = JSON.parse(result.data) as AzloreFile
              if (parsed.azlore) setLoreFile(parsed)
            } catch { /* invalid file */ }
          }}
          className="w-full text-xs bg-gray-800 hover:bg-gray-700 rounded px-2 py-2 text-left truncate"
        >
          Load lore file…
        </button>
        {loreFile && (
          <div className="mt-1 text-xs text-gray-400 truncate">
            <span className="text-green-400">✓</span> {loreFile.worldName} — {loreFile.entries.length} entries
          </div>
        )}
      </section>

    </aside>
  )
}
