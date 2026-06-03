import { create } from 'zustand'
import { AzloreFile, Climate, HexData, MapData, RegionData, RiverSize, SelectMode, SimWorldState, TerrainType, Tool, LayerVisibility, ViewMode } from '../types/map'
import { hexKey, hexesInRadius } from '../lib/hex'
import { normalizeClimate } from '../lib/climate'

const MAX_HISTORY = 50

const LORE_STRIP_PREFIXES = [
  'east ', 'west ', 'north ', 'south ', 'central ',
  'northern ', 'southern ', 'eastern ', 'western ',
  'upper ', 'lower ', 'inner ', 'outer ', 'lesser ', 'greater ',
]

function loreAutoLinkScore(regionName: string, entry: { name: string; tags: string[] }): number {
  const r = regionName.toLowerCase().trim()
  const e = entry.name.toLowerCase().trim()
  const eCore = e.startsWith('the ') ? e.slice(4) : e

  if (r === e || r === eCore) return 3

  let rCore = r
  for (const p of LORE_STRIP_PREFIXES) {
    if (r.startsWith(p)) { rCore = r.slice(p.length); break }
  }

  if (rCore !== r) {
    if (rCore === e || rCore === eCore) return 2
    if (entry.tags.some(t => t.toLowerCase().trim() === rCore)) return 1
  }

  if (entry.tags.some(t => t.toLowerCase().trim() === r)) return 1

  return 0
}

export const REGION_PALETTE = [
  '#c0392b', '#e67e22', '#d4ac0d', '#27ae60', '#16a085',
  '#2980b9', '#8e44ad', '#e91e63', '#ff5722', '#546e7a',
  '#6d4c41', '#00897b', '#1e88e5', '#5e35b1', '#f06292',
]

// Maps old climate-encoded terrain types to [terrain, climate]
const LEGACY_TERRAIN_MAP: Record<string, [TerrainType, Climate]> = {
  tundra_hills:         ['hills',         'ET'],
  tundra_mountain:      ['mountain',      'Dfc'],
  tundra_high_mountain: ['high_mountain', 'EF'],
  desert_hills:         ['hills',         'BWh'],
  desert_mountain:      ['mountain',      'BWk'],
  desert_high_mountain: ['high_mountain', 'BWk'],
  tundra:               ['plains',        'ET'],
  desert:               ['plains',        'BWh'],
  mediterranean:        ['grassland',     'Csa'],
}

const DEFAULT_CLIMATE: Record<TerrainType, Climate> = {
  ocean:        'Cfb',
  coast:        'Cfb',
  lake:         'Cfb',
  grassland:    'Cfb',
  plains:       'Cfb',
  hills:        'Cfb',
  forest:       'Cfb',
  deep_forest:  'Cfb',
  jungle:       'Af',
  deep_jungle:  'Af',
  mountain:     'Dfb',
  high_mountain:'Dfc',
  wetland:      'Cfa',
  highland:     'Cfb',
  riverland:    'Cfa',
}

function migrateHex(raw: any): HexData {
  const legacy = LEGACY_TERRAIN_MAP[raw.terrain as string]
  if (legacy) {
    return { ...raw, terrain: legacy[0], climate: normalizeClimate(raw.climate, legacy[1]) }
  }
  const terrain = raw.terrain as TerrainType
  return { ...raw, climate: normalizeClimate(raw.climate, DEFAULT_CLIMATE[terrain] ?? 'Cfb') }
}

function migrateRegion(raw: RegionData): RegionData {
  return {
    ...raw,
    climate: raw.climate ? normalizeClimate(raw.climate) : undefined,
  }
}

interface MapStore {
  map: MapData | null
  mapVersion: number
  currentFilePath: string | null
  selectedHex: string | null
  selectedRegion: string | null
  selectMode: SelectMode
  activeTool: Tool
  activeTerrain: TerrainType
  activeRiverSize: RiverSize
  activeRegion: string | null
  brushRadius: number
  layers: LayerVisibility
  isDirty: boolean
  history: Record<string, HexData>[]
  strokeBefore: Record<string, HexData> | null

  newMap: (name: string, width: number, height: number, hexSize: number, hexes?: Record<string, HexData>, regions?: Record<string, RegionData>) => void
  loadMap: (data: MapData, filePath: string) => void
  setFilePath: (path: string) => void
  beginStroke: () => void
  paintHex: (q: number, r: number) => void
  paintRegionHex: (q: number, r: number) => void
  endStroke: () => void
  undo: () => void
  selectHex: (key: string | null) => void
  selectRegion: (id: string | null) => void
  setSelectMode: (mode: SelectMode) => void
  updateHex: (key: string, data: Partial<HexData>) => void
  activeClimate: Climate
  setTool: (tool: Tool) => void
  setTerrain: (terrain: TerrainType) => void
  setClimate: (climate: Climate) => void
  setRiverSize: (size: RiverSize) => void
  paintClimateHex: (q: number, r: number) => void
  setActiveRegion: (id: string | null) => void
  setBrushRadius: (radius: number) => void
  toggleRiverEdge: (edgeKey: string) => void
  setLayer: (layer: keyof LayerVisibility, visible: boolean) => void
  setUnderlay: (path: string) => void
  markSaved: (filePath: string) => void
  resizeMap: (newWidth: number, newHeight: number) => void
  upsertRegion: (id: string, data: Partial<RegionData>) => void
  deleteRegion: (id: string) => void

  simWorld: SimWorldState | null
  isSimulating: boolean
  simFactionCount: number
  simType: 'clashvergence' | 'claudevergence'
  simSeed: string
  setSimWorld: (world: SimWorldState | null) => void
  setSimulating: (v: boolean) => void
  setSimFactionCount: (n: number) => void
  setSimType: (t: 'clashvergence' | 'claudevergence') => void
  setSimSeed: (seed: string) => void

  loreFile: AzloreFile | null
  setLoreFile: (f: AzloreFile | null, filePath?: string) => void

  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
}

export const useMapStore = create<MapStore>((set, get) => ({
  map: null,
  mapVersion: 0,
  currentFilePath: null,
  selectedHex: null,
  selectedRegion: null,
  selectMode: 'tile',
  activeTool: 'paint',
  activeTerrain: 'plains',
  activeClimate: 'Cfb',
  activeRiverSize: 'medium',
  activeRegion: null,
  brushRadius: 0,
  layers: {
    terrain: true,
    grid: true,
    regions: false,
    settlements: true,
    rivers: true,
    underlay: false,
    climate: false,
  },
  isDirty: false,
  history: [],
  strokeBefore: null,
  simWorld: null,
  isSimulating: false,
  simFactionCount: 9,
  simType: 'clashvergence',
  simSeed: '',
  setSimWorld: (world) => set({ simWorld: world }),
  setSimulating: (v) => set({ isSimulating: v }),
  setSimFactionCount: (n) => set({ simFactionCount: n }),
  setSimType: (t) => set({ simType: t }),
  setSimSeed: (seed) => set({ simSeed: seed }),

  loreFile: null,
  setLoreFile: (f, filePath?) => {
    if (!f) { set({ loreFile: null }); return }
    const { map } = get()
    if (!map) { set({ loreFile: f }); return }
    const updatedRegions = { ...map.regions }
    let changed = false
    for (const [id, region] of Object.entries(updatedRegions)) {
      if (region.loreRef) continue
      const scored = f.entries
        .map(e => ({ e, s: loreAutoLinkScore(region.name, e) }))
        .filter(({ s }) => s > 0)
        .sort((a, b) => b.s - a.s || a.e.name.length - b.e.name.length)
      const match = scored[0]?.e
      if (match) {
        updatedRegions[id] = { ...region, loreRef: match.id }
        changed = true
      }
    }
    const mapUpdate = (changed || filePath)
      ? { ...map, regions: changed ? updatedRegions : map.regions, ...(filePath ? { lorePath: filePath } : {}) }
      : map
    set({
      loreFile: f,
      ...(changed || filePath ? { map: mapUpdate, isDirty: true } : {}),
    })
  },

  viewMode: 'map',
  setViewMode: (m) => set({ viewMode: m }),

  newMap: (name, width, height, hexSize, precomputedHexes, precomputedRegions) => {
    let hexes: Record<string, HexData>
    if (precomputedHexes) {
      hexes = Object.fromEntries(
        Object.entries(precomputedHexes).map(([key, hex]) => [key, migrateHex(hex)]),
      )
    } else {
      hexes = {}
      for (let r = 0; r < height; r++) {
        for (let col = 0; col < width; col++) {
          const q = col - Math.floor(r / 2)
          hexes[hexKey(q, r)] = { q, r, terrain: 'ocean', climate: 'Cfb' }
        }
      }
    }
    const regions = Object.fromEntries(
      Object.entries(precomputedRegions ?? {}).map(([key, region]) => [key, migrateRegion(region)]),
    )
    set({
      map: { name, width, height, hexSize, climateSystem: 'koppen-v1', hexes, rivers: {}, regions },
      mapVersion: get().mapVersion + 1,
      currentFilePath: null,
      isDirty: true,
      selectedHex: null,
      selectedRegion: null,
      history: [],
      strokeBefore: null,
    })
  },

  loadMap: (data, filePath) => {
    // Migrate old rivers format (string[] → Record<string, RiverSize>)
    const rawRivers = (data as any).rivers
    const rivers: Record<string, RiverSize> = Array.isArray(rawRivers)
      ? Object.fromEntries(rawRivers.map((k: string) => [k, 'medium' as RiverSize]))
      : (rawRivers ?? {})

    // Migrate hexes: fill in missing climate and convert legacy terrain types
    const migratedHexes: Record<string, HexData> = {}
    for (const [key, hex] of Object.entries((data as any).hexes ?? {})) {
      migratedHexes[key] = migrateHex(hex)
    }
    const migratedRegions: Record<string, RegionData> = {}
    for (const [key, region] of Object.entries((data as any).regions ?? {})) {
      migratedRegions[key] = migrateRegion(region as RegionData)
    }

    set((state) => ({
      map: { ...data, climateSystem: 'koppen-v1', hexes: migratedHexes, rivers, regions: migratedRegions },
      mapVersion: state.mapVersion + 1,
      currentFilePath: filePath,
      isDirty: false,
      selectedHex: null,
      selectedRegion: null,
      history: [],
      strokeBefore: null,
      loreFile: null,
    }))
  },

  setFilePath: (path) => set({ currentFilePath: path }),

  beginStroke: () => set({ strokeBefore: {} }),

  paintHex: (q, r) => {
    const { map, activeTerrain, activeTool, brushRadius, strokeBefore } = get()
    if (!map) return
    const newTerrain = activeTool === 'erase' ? 'plains' : activeTerrain
    const updates: Record<string, HexData> = {}
    const newStrokeBefore = strokeBefore ? { ...strokeBefore } : null
    for (const coord of hexesInRadius(q, r, brushRadius)) {
      const key = hexKey(coord.q, coord.r)
      if (key in map.hexes && map.hexes[key].terrain !== newTerrain) {
        if (newStrokeBefore && !(key in newStrokeBefore)) newStrokeBefore[key] = map.hexes[key]
        updates[key] = { ...map.hexes[key], terrain: newTerrain }
      }
    }
    if (Object.keys(updates).length === 0) return
    set((state) => ({
      map: state.map ? { ...state.map, hexes: { ...state.map.hexes, ...updates } } : null,
      strokeBefore: newStrokeBefore,
      isDirty: true,
    }))
  },

  paintRegionHex: (q, r) => {
    const { map, activeRegion, brushRadius, strokeBefore } = get()
    if (!map) return
    const updates: Record<string, HexData> = {}
    const newStrokeBefore = strokeBefore ? { ...strokeBefore } : null
    for (const coord of hexesInRadius(q, r, brushRadius)) {
      const key = hexKey(coord.q, coord.r)
      if (key in map.hexes && map.hexes[key].region !== (activeRegion ?? undefined)) {
        if (newStrokeBefore && !(key in newStrokeBefore)) newStrokeBefore[key] = map.hexes[key]
        updates[key] = { ...map.hexes[key], region: activeRegion ?? undefined }
      }
    }
    if (Object.keys(updates).length === 0) return
    set((state) => ({
      map: state.map ? { ...state.map, hexes: { ...state.map.hexes, ...updates } } : null,
      strokeBefore: newStrokeBefore,
      isDirty: true,
    }))
  },

  endStroke: () => {
    const { strokeBefore } = get()
    if (!strokeBefore || Object.keys(strokeBefore).length === 0) {
      set({ strokeBefore: null })
      return
    }
    set((state) => ({
      history: [...state.history.slice(-(MAX_HISTORY - 1)), strokeBefore],
      strokeBefore: null,
    }))
  },

  undo: () => {
    const { map, history } = get()
    if (!map || history.length === 0) return
    const before = history[history.length - 1]
    set((state) => ({
      map: state.map ? { ...state.map, hexes: { ...state.map.hexes, ...before } } : null,
      history: state.history.slice(0, -1),
      isDirty: true,
    }))
  },

  selectHex:    (key)  => set({ selectedHex: key, selectedRegion: null }),
  selectRegion: (id)   => set({ selectedRegion: id, selectedHex: null }),
  setSelectMode:(mode) => set({ selectMode: mode, selectedHex: null, selectedRegion: null }),

  updateHex: (key, data) =>
    set((state) => {
      const patch = data.climate ? { ...data, climate: normalizeClimate(data.climate) } : data
      return {
        map: state.map
          ? { ...state.map, hexes: { ...state.map.hexes, [key]: { ...state.map.hexes[key], ...patch } } }
          : null,
        isDirty: true,
      }
    }),

  setTool: (tool) => set({ activeTool: tool }),
  setTerrain: (terrain) => set({ activeTerrain: terrain }),
  setClimate: (climate) => set({ activeClimate: normalizeClimate(climate) }),
  setRiverSize: (size) => set({ activeRiverSize: size }),

  paintClimateHex: (q, r) => {
    const { map, activeClimate, brushRadius, strokeBefore } = get()
    if (!map) return
    const updates: Record<string, HexData> = {}
    const newStrokeBefore = strokeBefore ? { ...strokeBefore } : null
    for (const coord of hexesInRadius(q, r, brushRadius)) {
      const key = hexKey(coord.q, coord.r)
      if (key in map.hexes && map.hexes[key].climate !== activeClimate) {
        if (newStrokeBefore && !(key in newStrokeBefore)) newStrokeBefore[key] = map.hexes[key]
        updates[key] = { ...map.hexes[key], climate: activeClimate }
      }
    }
    if (Object.keys(updates).length === 0) return
    set((state) => ({
      map: state.map ? { ...state.map, hexes: { ...state.map.hexes, ...updates } } : null,
      strokeBefore: newStrokeBefore,
      isDirty: true,
    }))
  },
  setActiveRegion: (id) => set({ activeRegion: id }),
  setBrushRadius: (radius) => set({ brushRadius: radius }),

  toggleRiverEdge: (edgeKey) =>
    set((state) => {
      if (!state.map) return {}
      const rivers = { ...state.map.rivers }
      if (edgeKey in rivers) {
        delete rivers[edgeKey]
      } else {
        rivers[edgeKey] = state.activeRiverSize
      }
      return { map: { ...state.map, rivers }, isDirty: true }
    }),

  setLayer: (layer, visible) =>
    set((state) => ({ layers: { ...state.layers, [layer]: visible } })),

  setUnderlay: (path) =>
    set((state) => ({
      map: state.map ? { ...state.map, underlayPath: path } : null,
      isDirty: true,
    })),

  markSaved: (filePath) => set({ isDirty: false, currentFilePath: filePath }),

  resizeMap: (newWidth, newHeight) => {
    const { map } = get()
    if (!map) return
    const validKeys = new Set<string>()
    for (let r = 0; r < newHeight; r++) {
      for (let col = 0; col < newWidth; col++) {
        validKeys.add(hexKey(col - Math.floor(r / 2), r))
      }
    }
    const hexes: Record<string, HexData> = {}
    for (const key of validKeys) {
      if (map.hexes[key]) {
        hexes[key] = map.hexes[key]
      } else {
        const [qs, rs] = key.split(',').map(Number)
        hexes[key] = { q: qs, r: rs, terrain: 'ocean', climate: 'Cfb' }
      }
    }
    set((state) => ({
      map: state.map ? { ...state.map, width: newWidth, height: newHeight, hexes } : null,
      isDirty: true,
      history: [],
    }))
  },

  upsertRegion: (id, data) =>
    set((state) => {
      if (!state.map) return {}
      const existing = state.map.regions[id] ?? { name: id, color: '#888888' }
      const patch = data.climate ? { ...data, climate: normalizeClimate(data.climate) } : data
      return {
        map: {
          ...state.map,
          regions: { ...state.map.regions, [id]: { ...existing, ...patch } },
        },
        isDirty: true,
      }
    }),

  deleteRegion: (id) =>
    set((state) => {
      if (!state.map) return {}
      const { [id]: _removed, ...rest } = state.map.regions
      const hexes = { ...state.map.hexes }
      for (const [key, hex] of Object.entries(hexes)) {
        if (hex.region === id) hexes[key] = { ...hex, region: undefined }
      }
      return {
        map: { ...state.map, regions: rest, hexes },
        isDirty: true,
      }
    }),
}))
