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

export type PolityTier = 'band' | 'tribe' | 'chiefdom' | 'state' | 'empire'
export type GovernmentForm =
  | 'council' | 'leader' | 'monarchy' | 'oligarchy'
  | 'republic' | 'theocracy' | 'military'

export interface FactionData {
  name: string
  color: string
  polityTier: PolityTier
  governmentForm: GovernmentForm
  capital?: string           // region ID of heartland/capital
  startingTreasury?: number
  primaryEthnicity?: string
  religion?: string
  notes?: string
  loreRef?: string
}

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
  factions?: Record<string, FactionData> // factionId → FactionData
}

export interface SimFaction {
  name: string
  display_name: string
  treasury: number
  owned_regions: number
  population: number
  doctrine_label: string
  government_type?: string
  polity_tier?: string
  culture_name?: string
  is_rebel?: boolean
  origin_faction?: string | null
  net_income?: number
  effective_income?: number
  maintenance?: number
  food_balance?: number
  food_stored?: number
  food_capacity?: number
  administrative_efficiency?: number
  administrative_overextension?: number
  military_readiness?: number
  army_quality?: number
  standing_forces?: number
  manpower_pool?: number
  shock_exposure?: number
  famine_pressure?: number
  trade_collapse_exposure?: number
  technology?: number
  institutional_technology?: number
  ruler_name?: string
  legitimacy?: number
  top_ally?: string | null
  top_rival?: string | null
  overlord?: string | null
  tributary_count?: number
  claim_dispute_count?: number
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

export interface SimSummary {
  active_factions: number
  successor_factions: number
  owned_regions: number
  unowned_regions: number
  total_regions: number
  total_population: number
  total_treasury: number
  average_unrest: number
  high_unrest_regions: number
  active_wars: number
  active_shocks: number
  alliances: number
  pacts: number
  rivalries: number
  tributaries: number
  total_events: number
  recent_events: number
}

export interface SimHotRegion {
  name: string
  display_name: string
  owner: string | null
  population: number
  unrest: number
  food_deficit: number
  trade_warfare_pressure: number
  climate_anomaly: number
  shock_exposure: number
  pressure: number
}

export interface SimActiveWar {
  factions: string[]
  aggressor: string
  defender: string
  objective: string
  target_region?: string | null
  turns_active: number
  attacks: number
  war_exhaustion: number
  score: number
}

export interface SimActiveShock {
  kind: string
  origin_region?: string | null
  faction?: string | null
  phase: string
  intensity: number
  turns_remaining: number
  affected_regions: number
}

export interface SimEvent {
  type: string
  faction?: string | null
  region?: string | null
  turn?: number
  details?: Record<string, unknown>
  impact?: Record<string, unknown>
  significance?: number
}

export type SimDetailSelection =
  | { type: 'faction'; factionName: string }
  | { type: 'region'; regionName: string }
  | { type: 'event'; event: SimEvent }

export interface SimWorldState {
  ok?: boolean
  turn: number
  turn_label: string
  summary?: SimSummary
  factions: SimFaction[]
  regions: SimRegion[]
  recent_events: SimEvent[]
  hot_regions?: SimHotRegion[]
  active_wars?: SimActiveWar[]
  active_shocks?: SimActiveShock[]
}

export type Tool = 'paint' | 'erase' | 'select' | 'pan' | 'river' | 'region' | 'climate' | 'faction'
export type SelectMode = 'tile' | 'region'
export type ViewMode = 'map' | 'balanced' | 'panel' | 'lore'

export interface LayerVisibility {
  terrain: boolean
  grid: boolean
  regions: boolean
  factions: boolean
  settlements: boolean
  rivers: boolean
  underlay: boolean
  climate: boolean
}
