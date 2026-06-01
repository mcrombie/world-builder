import { Climate, HexData, RegionData, TerrainType } from '../types/map'
import { hexKey } from './hex'

export interface MapGenConfig {
  width:          number
  height:         number
  seed:           number
  seaLevel:       number   // 0.2–0.7
  featureScale:   number   // 0.5–3.0
  mountainRate:   number   // 0–1
  temperature:    number   // 0–1 (cold → hot)
  moisture:       number   // 0–1 (dry → wet)
  islandFalloff:  number   // 0–1 (continent → island)
  erosion:        number   // 0–1 (none → heavy smoothing)
  polarGradient:  number   // 0–1 (uniform → cold poles)
  highlandRate:   number   // 0–1 (no plateaus → many plateaus)
  numRegions:     number   // 0 = none; >0 = auto-generated region count
}

export interface GeneratedRegions {
  hexes:   Record<string, HexData>
  regions: Record<string, RegionData>
}

// ── noise primitives ──────────────────────────────────────────────────────────

function hash(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.3) * 43758.5453123
  return n - Math.floor(n)
}

function smoothstep(t: number): number { return t * t * (3 - 2 * t) }

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = smoothstep(fx), uy = smoothstep(fy)
  const a = hash(ix,   iy,   seed), b = hash(ix+1, iy,   seed)
  const c = hash(ix,   iy+1, seed), d = hash(ix+1, iy+1, seed)
  return (a*(1-ux) + b*ux) * (1-uy) + (c*(1-ux) + d*ux) * uy
}

function fbm(x: number, y: number, seed: number, octaves = 6): number {
  let value = 0, amplitude = 0.5, frequency = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    value     += smoothNoise(x * frequency, y * frequency, seed + i * 17) * amplitude
    norm      += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return value / norm
}

function ridgeFbm(x: number, y: number, seed: number, octaves = 5): number {
  let value = 0, amplitude = 0.5, frequency = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = smoothNoise(x * frequency, y * frequency, seed + i * 17)
    value     += (1 - Math.abs(n * 2 - 1)) * amplitude
    norm      += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return value / norm
}

// ── seeded PRNG (mulberry32) ──────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6D2B79F5) >>> 0
    let n = Math.imul(t ^ (t >>> 15), t | 1)
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61)
    return ((n ^ (n >>> 14)) >>> 0) / 0x100000000
  }
}

// ── hex grid ──────────────────────────────────────────────────────────────────

const HEX_DIRS = [
  {q:1,r:0},{q:-1,r:0},{q:0,r:1},{q:0,r:-1},{q:1,r:-1},{q:-1,r:1},
]

// ── terrain classification ────────────────────────────────────────────────────
// Terrain is purely physical (elevation + moisture for vegetation).
// Climate is classified separately and stored independently on each hex.

function classifyTerrain(
  elevation:    number,
  temperature:  number,
  moisture:     number,
  seaLevel:     number,
  highlandRate: number,
  altNoise:     number,
): TerrainType {
  if (elevation < seaLevel) return 'ocean'

  const land = (elevation - seaLevel) / (1 - seaLevel)
  if (land < 0.07) return 'coast'

  const wet     = moisture > 0.65
  const moist   = moisture > 0.42
  const tropical = temperature > 0.68

  if (land > 0.78) return 'high_mountain'
  if (land > 0.55) return 'mountain'
  if (land > 0.38 && altNoise < highlandRate * 0.85) return 'highland'

  if (land > 0.35) return wet ? (tropical ? 'deep_jungle' : 'deep_forest') : 'hills'
  if (wet)   return tropical ? 'deep_jungle' : 'wetland'
  if (moist) return land > 0.28 ? (tropical ? 'jungle' : 'forest') : 'plains'
  if (land > 0.30) return 'hills'
  if (moisture < 0.32) return 'grassland'
  return 'plains'
}

// ── coast distance (BFS from ocean) ──────────────────────────────────────────
// Distance 0 = ocean hex; 1 = hex adjacent to ocean; etc.

function computeCoastDist(elevMap: Record<string, number>, seaLevel: number): Record<string, number> {
  const dist: Record<string, number> = {}
  const queue: string[] = []

  for (const key of Object.keys(elevMap)) {
    if (elevMap[key] < seaLevel) {
      dist[key] = 0
      queue.push(key)
    }
  }

  let head = 0
  while (head < queue.length) {
    const key = queue[head++]
    const [q, r] = key.split(',').map(Number)
    const d = dist[key]
    for (const dir of HEX_DIRS) {
      const nk = hexKey(q + dir.q, r + dir.r)
      if (nk in elevMap && !(nk in dist)) {
        dist[nk] = d + 1
        queue.push(nk)
      }
    }
  }

  return dist
}

// ── rain shadow ───────────────────────────────────────────────────────────────
// Moisture is reduced on the leeward (east) side of mountain barriers.
// We use a westerly prevailing wind: look in the -q direction for high terrain.

function getRainShadow(
  elevMap:  Record<string, number>,
  q:        number,
  r:        number,
  seaLevel: number,
  reach:    number,
): number {
  let maxBarrier = 0
  for (let step = 1; step <= reach; step++) {
    // Cast ray westward (-q) and also slight diagonals to catch angled ranges
    for (const dq of [-step]) {
      for (const dr of [0, -Math.round(step * 0.5), Math.round(step * 0.5)]) {
        const k = hexKey(q + dq, r + dr)
        const e = elevMap[k]
        if (e === undefined) continue
        if (e < seaLevel) continue   // open ocean upwind: no shadow
        // Barrier strength: only significant elevation (above sea level + buffer) matters
        const barrierHeight = Math.max(0, e - seaLevel - 0.20)
        const distDecay     = (reach - step + 1) / reach
        maxBarrier = Math.max(maxBarrier, barrierHeight * distDecay)
      }
    }
  }
  // Cap the moisture reduction; stronger mountains → deeper shadow
  return Math.min(0.40, maxBarrier * 1.8)
}

// ── climate classification ────────────────────────────────────────────────────
// Uses terrain type, adjusted temperature/moisture (already geography-corrected),
// and distance to nearest coast for oceanic vs continental distinction.

function classifyClimate(
  terrain:   TerrainType,
  temp:      number,   // 0 = cold, 1 = hot
  moisture:  number,   // 0 = arid, 1 = wet (already adjusted for rain shadow & continentality)
  coastDist: number,   // hex steps to nearest ocean (0 = ocean)
): Climate {
  // ── Water ─────────────────────────────────────────────────────────────────
  if (terrain === 'ocean') return 'oceanic'

  // ── Coasts: moderate oceanic, tropical if hot, cold if polar ──────────────
  if (terrain === 'coast') {
    if (temp < 0.20) return 'cold'
    if (temp > 0.70) return 'tropical'
    return 'oceanic'
  }

  // ── High mountains are always above the snowline ──────────────────────────
  if (terrain === 'high_mountain') return 'cold'

  // ── Mountains: cold in temperate zones, temperate in tropics ─────────────
  if (terrain === 'mountain') return temp < 0.60 ? 'cold' : 'temperate'

  // ── Polar / subarctic ─────────────────────────────────────────────────────
  if (temp < 0.18) return 'cold'
  if (temp < 0.27 && moisture < 0.52) return 'cold'

  // ── Tropical: hot + at least moderate moisture ────────────────────────────
  if (temp > 0.72 && moisture > 0.38) return 'tropical'

  // ── Arid: very dry regardless of temperature ──────────────────────────────
  if (moisture < 0.20) return 'arid'
  if (temp > 0.65 && moisture < 0.40) return 'arid'   // hot deserts

  // ── Steppe: semi-arid or continental interior dryness ────────────────────
  if (moisture < 0.33) return 'steppe'
  if (moisture < 0.44 && coastDist > 5) return 'steppe'

  // ── Oceanic: coastal belt with adequate moisture ──────────────────────────
  if (coastDist <= 3 && moisture > 0.42 && temp > 0.24 && temp < 0.72) return 'oceanic'
  if (coastDist <= 6 && moisture > 0.55 && temp > 0.24 && temp < 0.72) return 'oceanic'

  // ── Default: temperate ────────────────────────────────────────────────────
  return 'temperate'
}

// ── main generator ────────────────────────────────────────────────────────────

export function generateMap(cfg: MapGenConfig): Record<string, HexData> {
  const {
    width, height, seed, seaLevel, featureScale,
    mountainRate, temperature: tempBias, moisture: moistBias,
    islandFalloff, erosion, polarGradient, highlandRate,
  } = cfg

  const BASE_SCALE = 3.5
  const elevMap: Record<string, number> = {}
  const altMap:  Record<string, number> = {}

  // ── Pass 1: raw elevation + highland alt noise ────────────────────────────
  for (let r = 0; r < height; r++) {
    for (let col = 0; col < width; col++) {
      const q  = col - Math.floor(r / 2)
      const k  = hexKey(q, r)
      const nx = (col / width)  * BASE_SCALE * featureScale
      const ny = (r   / height) * BASE_SCALE * featureScale

      const dx = col / width - 0.5, dy = r / height - 0.5
      const dist    = Math.sqrt(dx*dx + dy*dy) * 2
      const falloff = Math.pow(Math.min(1, dist), 1.5) * islandFalloff * 0.55

      const baseElev  = fbm(nx, ny, seed)
      const ridgeElev = ridgeFbm(nx * 1.3, ny * 1.3, seed + 500)
      elevMap[k] = Math.max(0, Math.min(1,
        baseElev * (1 - mountainRate * 0.6) + ridgeElev * mountainRate * 0.6 - falloff
      ))
      altMap[k] = fbm(nx + 300, ny + 300, seed + 4000, 3)
    }
  }

  // ── Erosion: iterative neighbour-weighted averaging ───────────────────────
  const erosionPasses = Math.round(erosion * 4)
  for (let p = 0; p < erosionPasses; p++) {
    const smoothed: Record<string, number> = {}
    for (let r = 0; r < height; r++) {
      for (let col = 0; col < width; col++) {
        const q = col - Math.floor(r / 2)
        const k = hexKey(q, r)
        let sum = elevMap[k] * 2, count = 2
        for (const d of HEX_DIRS) {
          const nk = hexKey(q + d.q, r + d.r)
          if (nk in elevMap) { sum += elevMap[nk]; count++ }
        }
        smoothed[k] = sum / count
      }
    }
    Object.assign(elevMap, smoothed)
  }

  // ── Pass 2: raw temperature + moisture ───────────────────────────────────
  const tempMap:  Record<string, number> = {}
  const moistMap: Record<string, number> = {}
  for (let r = 0; r < height; r++) {
    for (let col = 0; col < width; col++) {
      const q  = col - Math.floor(r / 2)
      const k  = hexKey(q, r)
      const nx = (col / width)  * BASE_SCALE * featureScale
      const ny = (r   / height) * BASE_SCALE * featureScale

      const land     = Math.max(0, (elevMap[k] - seaLevel) / (1 - seaLevel))
      const elevCool = land > 0.5 ? (land - 0.5) * 0.6 : 0
      const poleCool = polarGradient * Math.abs(r / height - 0.5) * 2 * 0.65
      const tempNoise = fbm(nx + 100, ny + 100, seed + 2000, 4)
      tempMap[k] = Math.max(0, Math.min(1,
        tempNoise * 0.5 + tempBias * 0.5 - elevCool - poleCool
      ))

      const moistNoise = fbm(nx + 200, ny + 200, seed + 3000, 4)
      moistMap[k] = Math.max(0, Math.min(1,
        moistNoise * 0.6 + moistBias * 0.4
      ))
    }
  }

  // ── Pass 3: coast distance BFS ────────────────────────────────────────────
  const coastDist = computeCoastDist(elevMap, seaLevel)

  // ── Pass 4: geography-adjusted moisture ──────────────────────────────────
  // Continental drying: inland areas lose moisture relative to coasts.
  // Rain shadow: leeward (east) of mountains is drier.
  const COAST_REACH  = Math.max(8,  Math.ceil(Math.min(width, height) * 0.12))
  const SHADOW_REACH = Math.max(4,  Math.ceil(width * 0.07))

  const adjMoistMap: Record<string, number> = {}
  for (let r = 0; r < height; r++) {
    for (let col = 0; col < width; col++) {
      const q = col - Math.floor(r / 2)
      const k = hexKey(q, r)
      if (elevMap[k] < seaLevel) {
        adjMoistMap[k] = moistMap[k]
        continue
      }
      const dist          = coastDist[k] ?? COAST_REACH
      const continentalDry = Math.min(dist / COAST_REACH, 1) * 0.28
      const shadowDry      = getRainShadow(elevMap, q, r, seaLevel, SHADOW_REACH)
      adjMoistMap[k] = Math.max(0, moistMap[k] - continentalDry - shadowDry)
    }
  }

  // ── Pass 5: classify terrain + climate ────────────────────────────────────
  const hexes: Record<string, HexData> = {}
  for (let r = 0; r < height; r++) {
    for (let col = 0; col < width; col++) {
      const q = col - Math.floor(r / 2)
      const k = hexKey(q, r)
      const terrain = classifyTerrain(elevMap[k], tempMap[k], adjMoistMap[k], seaLevel, highlandRate, altMap[k])
      const climate = classifyClimate(terrain, tempMap[k], adjMoistMap[k], coastDist[k] ?? COAST_REACH)
      hexes[k] = { q, r, terrain, climate }
    }
  }

  return hexes
}

// ── region generation ─────────────────────────────────────────────────────────

const SYLLABLES = [
  'ar','el','or','an','in','al','en','un',
  'dar','vel','mor','tal','sen','kar','fen','bor',
  'ash','eth','orn','eld','val','mir','nor','sur',
  'gor','tor','har','var','kel','tel','ran','dan',
]

function makeName(rng: () => number): string {
  const len = rng() < 0.45 ? 2 : 3
  let name = ''
  for (let i = 0; i < len; i++)
    name += SYLLABLES[Math.floor(rng() * SYLLABLES.length)]
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function regionHue(idx: number, total: number, seedOffset: number): string {
  const hue = ((idx * 0.618033988749895 + (seedOffset % 360) / 360) % 1) * 360
  const sat  = 50 + (idx * 7)  % 25
  const lgt  = 42 + (idx * 11) % 15
  return `hsl(${Math.round(hue)},${sat}%,${lgt}%)`
}

export function generateRegions(
  hexes:      Record<string, HexData>,
  numRegions: number,
  seed:       number,
): GeneratedRegions {
  const rng = mulberry32(seed ^ 0xDEADBEEF)

  const landHexes = Object.values(hexes).filter(h => h.terrain !== 'ocean')
  const n = Math.min(numRegions, landHexes.length)
  if (n === 0) return { hexes, regions: {} }

  // Farthest-point seeding: maximises minimum distance between seeds
  const dist2 = (a: HexData, b: HexData) => {
    const dq = a.q - b.q, dr = a.r - b.r
    return dq*dq + dr*dr + dq*dr
  }
  const seeds: HexData[] = [landHexes[Math.floor(rng() * landHexes.length)]]
  const minD = new Float32Array(landHexes.length)
  for (let i = 0; i < landHexes.length; i++) minD[i] = dist2(landHexes[i], seeds[0])

  while (seeds.length < n) {
    let bestIdx = 0
    for (let i = 1; i < landHexes.length; i++) if (minD[i] > minD[bestIdx]) bestIdx = i
    const s = landHexes[bestIdx]
    seeds.push(s)
    for (let i = 0; i < landHexes.length; i++) minD[i] = Math.min(minD[i], dist2(landHexes[i], s))
  }

  // Multi-source BFS (Voronoi partition)
  const assignment: Record<string, number> = {}
  const queue: Array<{ key: string; idx: number }> = []
  for (let i = 0; i < seeds.length; i++) {
    const k = hexKey(seeds[i].q, seeds[i].r)
    assignment[k] = i
    queue.push({ key: k, idx: i })
  }
  let head = 0
  while (head < queue.length) {
    const { key, idx } = queue[head++]
    const hex = hexes[key]
    for (const d of HEX_DIRS) {
      const nk = hexKey(hex.q + d.q, hex.r + d.r)
      if (hexes[nk] && !(nk in assignment) && hexes[nk].terrain !== 'ocean') {
        assignment[nk] = idx
        queue.push({ key: nk, idx })
      }
    }
  }

  // Build region records and annotate hexes
  const regions: Record<string, RegionData> = {}
  for (let i = 0; i < n; i++)
    regions[`r${i}`] = { name: makeName(rng), color: regionHue(i, n, seed) }

  const updatedHexes = { ...hexes }
  for (const [key, idx] of Object.entries(assignment))
    updatedHexes[key] = { ...updatedHexes[key], region: `r${idx}` }

  return { hexes: updatedHexes, regions }
}
