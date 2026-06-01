import { Climate, TerrainType } from '../types/map'

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  ocean:       '#1a5c8a',
  coast:       '#4a9bb8',
  grassland:   '#c8d878',
  plains:      '#d4c080',
  hills:       '#a8a06a',
  forest:      '#4a7c4e',
  deep_forest: '#2d5a32',
  jungle:      '#3a8c58',
  deep_jungle: '#1a5c36',
  mountain:    '#8b8b8b',
  high_mountain:'#d0d0d0',
  wetland:     '#6a9b7c',
  lake:        '#6baed6',
  highland:    '#b09060',
  riverland:   '#7ab8a8',
}

export const TERRAIN_LABELS: Record<TerrainType, string> = {
  ocean:        'Ocean',
  coast:        'Coast',
  grassland:    'Grassland',
  plains:       'Plains',
  hills:        'Hills',
  forest:       'Forest',
  deep_forest:  'Deep Forest',
  jungle:       'Jungle',
  deep_jungle:  'Deep Jungle',
  mountain:     'Mountain',
  high_mountain:'High Mountain',
  wetland:      'Wetland',
  lake:         'Lake',
  highland:     'Highland',
  riverland:    'Riverland',
}

export const ALL_TERRAINS: TerrainType[] = [
  'ocean', 'coast', 'grassland', 'plains', 'hills',
  'forest', 'deep_forest', 'jungle', 'deep_jungle',
  'mountain', 'high_mountain',
  'wetland', 'lake',
  'highland', 'riverland',
]

export const CLIMATE_COLORS: Record<Climate, string> = {
  temperate: '#7ab87a',
  oceanic:   '#5b9ec9',
  cold:      '#a8c8d8',
  arid:      '#d4a84b',
  steppe:    '#c8b870',
  tropical:  '#3aad6e',
}

export const CLIMATE_LABELS: Record<Climate, string> = {
  temperate: 'Temperate',
  oceanic:   'Oceanic',
  cold:      'Cold',
  arid:      'Arid',
  steppe:    'Steppe',
  tropical:  'Tropical',
}

export const ALL_CLIMATES: Climate[] = [
  'temperate', 'oceanic', 'cold', 'arid', 'steppe', 'tropical',
]
