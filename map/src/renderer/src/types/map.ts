export type RiverSize = 'small' | 'medium' | 'large'

export interface LoreEntry {
  id: string
  name: string
  category: string
  tags: string[]
  related: string[]
  summary: string
  body: string
  sourcePath: string
}

export interface AzloreFile {
  azlore: true
  worldName: string
  version: string
  compiledAt: string
  entries: LoreEntry[]
}

export type TerrainType =
  | 'ocean'
  | 'coast'
  | 'grassland'
  | 'plains'
  | 'hills'
  | 'forest'
  | 'deep_forest'
  | 'jungle'
  | 'deep_jungle'
  | 'mountain'
  | 'high_mountain'
  | 'wetland'
  | 'lake'
  | 'highland'
  | 'riverland'

export type SettlementSize = 'village' | 'town' | 'city' | 'capital'
export type KoppenClimate =
  | 'Af' | 'Am' | 'Aw'
  | 'BWh' | 'BWk' | 'BSh' | 'BSk'
  | 'Csa' | 'Csb' | 'Csc' | 'Cwa' | 'Cwb' | 'Cwc' | 'Cfa' | 'Cfb' | 'Cfc'
  | 'Dsa' | 'Dsb' | 'Dsc' | 'Dsd' | 'Dwa' | 'Dwb' | 'Dwc' | 'Dwd' | 'Dfa' | 'Dfb' | 'Dfc' | 'Dfd'
  | 'ET' | 'EF'
export type Climate = KoppenClimate
export type CoreStatus = 'homeland' | 'core' | 'frontier'

export interface RegionData {
  name: string
  color: string
  faction?: string
  climate?: Climate
  coreStatus?: CoreStatus
  loreRef?: string          // ID into a loaded AzloreFile
  notes?: string
  lore?: string             // legacy: embedded lore text from populate_region_lore.py
}

export interface HexData {
  q: number
  r: number
  terrain: TerrainType
  climate: Climate
  region?: string          // key into MapData.regions
  settlement?: string
  settlementSize?: SettlementSize
  notes?: string
}

export interface MapData {
  name: string
  width: number
  height: number
  hexSize: number
  climateSystem?: 'koppen-v1'
  hexes: Record<string, HexData>
  underlayPath?: string
  lorePath?: string                      // absolute path to the linked .azlore file
  rivers: Record<string, RiverSize>      // edgeKey → size
  regions: Record<string, RegionData>    // regionId → RegionData
}

export interface SimFaction {
  name: string
  display_name: string
  treasury: number
  owned_regions: number
  population: number
  doctrine_label: string
}

export interface SimRegion {
  name: string
  display_name: string
  owner: string | null
  population: number
  resources: number
  unrest: number
  climate?: string
  climate_label?: string
  climate_anomaly?: number
}

export interface SimWorldState {
  ok?: boolean
  turn: number
  turn_label: string
  factions: SimFaction[]
  regions: SimRegion[]
  recent_events: unknown[]
}

export type Tool = 'paint' | 'erase' | 'select' | 'pan' | 'river' | 'region' | 'climate'
export type SelectMode = 'tile' | 'region'
export type ViewMode = 'map' | 'balanced' | 'panel' | 'lore'

export interface LayerVisibility {
  terrain: boolean
  grid: boolean
  regions: boolean
  settlements: boolean
  rivers: boolean
  underlay: boolean
  climate: boolean
}
