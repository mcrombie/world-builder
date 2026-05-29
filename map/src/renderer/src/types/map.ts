export type RiverSize = 'small' | 'medium' | 'large'

export type TerrainType =
  | 'ocean'
  | 'coast'
  | 'grassland'
  | 'hills'
  | 'tundra_hills'
  | 'desert_hills'
  | 'forest'
  | 'deep_forest'
  | 'mountain'
  | 'tundra_mountain'
  | 'desert_mountain'
  | 'high_mountain'
  | 'tundra_high_mountain'
  | 'desert_high_mountain'
  | 'desert'
  | 'tundra'
  | 'wetland'
  | 'lake'
  | 'highland'
  | 'riverland'
  | 'plains'
  | 'mediterranean'

export type SettlementSize = 'village' | 'town' | 'city' | 'capital'
export type Climate    = 'temperate' | 'oceanic' | 'cold' | 'arid' | 'steppe' | 'tropical'
export type CoreStatus = 'homeland' | 'core' | 'frontier'

export interface RegionData {
  name: string
  color: string
  faction?: string
  climate?: Climate
  coreStatus?: CoreStatus
  notes?: string
  lore?: string
}

export interface HexData {
  q: number
  r: number
  terrain: TerrainType
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
  hexes: Record<string, HexData>
  underlayPath?: string
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
}

export interface SimWorldState {
  ok?: boolean
  turn: number
  turn_label: string
  factions: SimFaction[]
  regions: SimRegion[]
  recent_events: unknown[]
}

export type Tool = 'paint' | 'erase' | 'select' | 'pan' | 'river' | 'region'
export type SelectMode = 'tile' | 'region'

export interface LayerVisibility {
  terrain: boolean
  grid: boolean
  regions: boolean
  settlements: boolean
  rivers: boolean
  underlay: boolean
}
