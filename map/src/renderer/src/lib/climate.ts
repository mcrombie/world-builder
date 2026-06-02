import { Climate, KoppenClimate } from '../types/map'

export const KOPPEN_CLIMATES = [
  'Af', 'Am', 'Aw',
  'BWh', 'BWk', 'BSh', 'BSk',
  'Csa', 'Csb', 'Csc', 'Cwa', 'Cwb', 'Cwc', 'Cfa', 'Cfb', 'Cfc',
  'Dsa', 'Dsb', 'Dsc', 'Dsd', 'Dwa', 'Dwb', 'Dwc', 'Dwd', 'Dfa', 'Dfb', 'Dfc', 'Dfd',
  'ET', 'EF',
] as const satisfies readonly KoppenClimate[]

export const CLIMATE_GROUPS = [
  { id: 'A', label: 'Tropical', climates: ['Af', 'Am', 'Aw'] },
  { id: 'B', label: 'Dry', climates: ['BWh', 'BWk', 'BSh', 'BSk'] },
  { id: 'C', label: 'Temperate', climates: ['Csa', 'Csb', 'Csc', 'Cwa', 'Cwb', 'Cwc', 'Cfa', 'Cfb', 'Cfc'] },
  { id: 'D', label: 'Continental', climates: ['Dsa', 'Dsb', 'Dsc', 'Dsd', 'Dwa', 'Dwb', 'Dwc', 'Dwd', 'Dfa', 'Dfb', 'Dfc', 'Dfd'] },
  { id: 'E', label: 'Polar', climates: ['ET', 'EF'] },
] as const satisfies readonly {
  id: 'A' | 'B' | 'C' | 'D' | 'E'
  label: string
  climates: readonly KoppenClimate[]
}[]

export const ALL_CLIMATES: KoppenClimate[] = [...KOPPEN_CLIMATES]

export const CLIMATE_LABELS: Record<KoppenClimate, string> = {
  Af: 'Tropical Rainforest',
  Am: 'Tropical Monsoon',
  Aw: 'Tropical Savanna',
  BWh: 'Hot Desert',
  BWk: 'Cold Desert',
  BSh: 'Hot Steppe',
  BSk: 'Cold Steppe',
  Csa: 'Hot-Summer Mediterranean',
  Csb: 'Warm-Summer Mediterranean',
  Csc: 'Cold-Summer Mediterranean',
  Cwa: 'Dry-Winter Humid Subtropical',
  Cwb: 'Dry-Winter Subtropical Highland',
  Cwc: 'Dry-Winter Subpolar Oceanic',
  Cfa: 'Humid Subtropical',
  Cfb: 'Oceanic',
  Cfc: 'Subpolar Oceanic',
  Dsa: 'Hot-Summer Dry-Summer Continental',
  Dsb: 'Warm-Summer Dry-Summer Continental',
  Dsc: 'Cold-Summer Dry-Summer Subarctic',
  Dsd: 'Severe-Winter Dry-Summer Subarctic',
  Dwa: 'Hot-Summer Dry-Winter Continental',
  Dwb: 'Warm-Summer Dry-Winter Continental',
  Dwc: 'Cold-Summer Dry-Winter Subarctic',
  Dwd: 'Severe-Winter Dry-Winter Subarctic',
  Dfa: 'Hot-Summer Humid Continental',
  Dfb: 'Warm-Summer Humid Continental',
  Dfc: 'Subarctic',
  Dfd: 'Severe-Winter Subarctic',
  ET: 'Tundra',
  EF: 'Ice Cap',
}

export const CLIMATE_COLORS: Record<KoppenClimate, string> = {
  Af: '#2f7d4f',
  Am: '#3f9460',
  Aw: '#66ad68',
  BWh: '#d7a54d',
  BWk: '#c4a15d',
  BSh: '#d6c55f',
  BSk: '#c7bc70',
  Csa: '#b9c765',
  Csb: '#a9c978',
  Csc: '#9ec48d',
  Cwa: '#72b86f',
  Cwb: '#76b78e',
  Cwc: '#7fb6a5',
  Cfa: '#68b47a',
  Cfb: '#5b90cc',
  Cfc: '#7daed0',
  Dsa: '#b8a26b',
  Dsb: '#a9a978',
  Dsc: '#9aa98e',
  Dsd: '#8c9aa4',
  Dwa: '#8fb66b',
  Dwb: '#82ad80',
  Dwc: '#7da7a1',
  Dwd: '#8193b8',
  Dfa: '#91b45f',
  Dfb: '#9dc3d9',
  Dfc: '#8db7d4',
  Dfd: '#7f9fc4',
  ET: '#b7cbd2',
  EF: '#d7e3ea',
}

export const LEGACY_CLIMATE_ALIASES: Record<string, KoppenClimate> = {
  temperate: 'Cfb',
  oceanic: 'Cfb',
  cold: 'Dfb',
  continental: 'Dfb',
  arid: 'BWh',
  desert: 'BWh',
  steppe: 'BSk',
  tropical: 'Aw',
  savanna: 'Aw',
  rainforest: 'Af',
  monsoon: 'Am',
  mediterranean: 'Csa',
  subtropical: 'Cfa',
  subarctic: 'Dfc',
  tundra: 'ET',
  polar: 'ET',
  ice: 'EF',
}

const NORMALIZED_KOPPEN_CODES: Record<string, KoppenClimate> = Object.fromEntries(
  KOPPEN_CLIMATES.map((climate) => [climate.toLowerCase(), climate]),
) as Record<string, KoppenClimate>

export function isKoppenClimate(value: unknown): value is KoppenClimate {
  return typeof value === 'string' && value.toLowerCase() in NORMALIZED_KOPPEN_CODES
}

export function normalizeClimate(value: unknown, fallback: KoppenClimate = 'Cfb'): Climate {
  if (value === null || value === undefined) return fallback
  const raw = String(value).trim()
  if (!raw) return fallback
  const lowered = raw.toLowerCase()
  return LEGACY_CLIMATE_ALIASES[lowered] ?? NORMALIZED_KOPPEN_CODES[lowered] ?? fallback
}

export function getClimateColor(value: unknown): string {
  return CLIMATE_COLORS[normalizeClimate(value)]
}

export function getClimateLabel(value: unknown): string {
  return CLIMATE_LABELS[normalizeClimate(value)]
}

export function getClimateCodeLabel(value: unknown): string {
  const climate = normalizeClimate(value)
  return `${climate} ${CLIMATE_LABELS[climate]}`
}

export function getClimateGroup(value: unknown): string {
  const climate = normalizeClimate(value)
  return climate[0]
}

export function getClimateGroupLabel(value: unknown): string {
  const group = getClimateGroup(value)
  return CLIMATE_GROUPS.find((entry) => entry.id === group)?.label ?? group
}

export function classifyKoppenClimate(
  monthlyTemperatureC: number[],
  monthlyPrecipitationMm: number[],
): KoppenClimate {
  if (monthlyTemperatureC.length !== 12 || monthlyPrecipitationMm.length !== 12) {
    throw new Error('Koppen classification requires 12 monthly temperature and precipitation values.')
  }

  const temperatures = monthlyTemperatureC.map((value) => Number(value))
  const precipitation = monthlyPrecipitationMm.map((value) => Math.max(0, Number(value)))
  const coldest = Math.min(...temperatures)
  const hottest = Math.max(...temperatures)
  const meanTemp = temperatures.reduce((sum, value) => sum + value, 0) / 12
  const annualPrecip = precipitation.reduce((sum, value) => sum + value, 0)
  const monthsAbove10 = temperatures.filter((value) => value >= 10).length
  const warmMonths = [3, 4, 5, 6, 7, 8]
  const coolMonths = [0, 1, 2, 9, 10, 11]
  const warmPrecip = warmMonths.reduce((sum, index) => sum + precipitation[index], 0)
  const coolPrecip = coolMonths.reduce((sum, index) => sum + precipitation[index], 0)
  const warmFraction = annualPrecip > 0 ? warmPrecip / annualPrecip : 0.5
  let aridityThreshold = 20 * meanTemp
  if (warmFraction >= 0.7) aridityThreshold += 280
  else if (warmFraction >= 0.3) aridityThreshold += 140

  if (annualPrecip < aridityThreshold) {
    const dryness = annualPrecip < aridityThreshold * 0.5 ? 'W' : 'S'
    const heat = meanTemp >= 18 ? 'h' : 'k'
    return normalizeClimate(`B${dryness}${heat}`)
  }

  const driestMonth = Math.min(...precipitation)
  if (coldest >= 18) {
    if (driestMonth >= 60) return 'Af'
    if (driestMonth >= 100 - annualPrecip / 25) return 'Am'
    return 'Aw'
  }

  if (hottest < 10) {
    return hottest >= 0 ? 'ET' : 'EF'
  }

  const group = coldest > 0 ? 'C' : 'D'
  const summerPrecip = warmMonths.map((index) => precipitation[index])
  const winterPrecip = coolMonths.map((index) => precipitation[index])
  const drySummer = Math.min(...summerPrecip) < 40 && Math.min(...summerPrecip) < Math.max(...winterPrecip) / 3
  const dryWinter = Math.min(...winterPrecip) < Math.max(...summerPrecip) / 10
  const seasonalLetter = drySummer && !dryWinter ? 's' : dryWinter && !drySummer ? 'w' : 'f'
  const heatLetter = hottest >= 22 && monthsAbove10 >= 4
    ? 'a'
    : monthsAbove10 >= 4
      ? 'b'
      : group === 'D' && coldest <= -38
        ? 'd'
        : 'c'

  return normalizeClimate(`${group}${seasonalLetter}${heatLetter}`)
}
