import { HexData, RegionData, TerrainType } from '../types/map'
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

function classifyTerrain(
  elevation:    number,
  temperature:  number,
  moisture:     number,
  seaLevel:     number,
  highlandRate: number,
  altNoise:     number,
): TerrainType {
  if (elevation < seaLevel) return 'ocean'

  const land  = (elevation - seaLevel) / (1 - seaLevel)
  if (land < 0.07) return 'coast'

  const cold  = temperature < 0.22
  const hot   = temperature > 0.68
  const dry   = moisture    < 0.35
  const wet   = moisture    > 0.65
  const moist = moisture    > 0.42

  if (land > 0.78) {
    if (cold)        return 'tundra_high_mountain'
    if (hot && dry)  return 'desert_high_mountain'
    return 'high_mountain'
  }
  if (land > 0.55) {
    if (cold)        return 'tundra_mountain'
    if (hot && dry)  return 'desert_mountain'
    return 'mountain'
  }

  if (cold) return land > 0.35 ? 'tundra_hills' : 'tundra'
  if (hot && dry) return land > 0.35 ? 'desert_hills' : 'desert'

  if (land > 0.38 && altNoise < highlandRate * 0.85) return 'highland'

  if (temperature > 0.58 && moisture > 0.28 && moisture < 0.52 && land < 0.45)
    return 'mediterranean'

  if (wet)   return land > 0.35 ? 'deep_forest' : 'wetland'
  if (moist) return land > 0.28 ? 'forest' : 'plains'
  if (land > 0.32) return 'hills'
  if (moisture < 0.30) return 'grassland'
  return 'plains'
}

// ── main generator ────────────────────────────────────────────────────────────

export function generateMap(cfg: MapGenConfig): Record<string, HexData> {
  const {
    width, height, seed, seaLevel, featureScale,
    mountainRate, temperature: tempBias, moisture: moistBias,
    islandFalloff, erosion, polarGradient, highlandRate,
  } = cfg

  const BASE_SCALE = 3.5
  const elevMap:  Record<string, number> = {}
  const altMap:   Record<string, number> = {}

  // Pass 1: raw elevation + highland noise
  for (let r = 0; r < height; r++) {
    for (let col = 0; col < width; col++) {
      const q  = col - Math.floor(r / 2)
      const k  = hexKey(q, r)
      const nx = (col / width)  * BASE_SCALE * featureScale
      const ny = (r   / height) * BASE_SCALE * featureScale

      const dx  = col / width  - 0.5
      const dy  = r   / height - 0.5
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

  // Erosion: iterative neighbour-weighted averaging
  const erosionPasses = Math.round(erosion * 4)
  for (let p = 0; p < erosionPasses; p++) {
    const smoothed: Record<string, number> = {}
    for (let r = 0; r < height; r++) {
      for (let col = 0; col < width; col++) {
        const q = col - Math.floor(r / 2)
        const k = hexKey(q, r)
        let sum = elevMap[k] * 2, count = 2  // self weighted ×2 to retain shape
        for (const d of HEX_DIRS) {
          const nk = hexKey(q + d.q, r + d.r)
          if (nk in elevMap) { sum += elevMap[nk]; count++ }
        }
        smoothed[k] = sum / count
      }
    }
    Object.assign(elevMap, smoothed)
  }

  // Pass 2: temperature + moisture (uses smoothed elevation)
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

  // Pass 3: classify
  const hexes: Record<string, HexData> = {}
  for (let r = 0; r < height; r++) {
    for (let col = 0; col < width; col++) {
      const q = col - Math.floor(r / 2)
      const k = hexKey(q, r)
      hexes[k] = {
        q, r,
        terrain: classifyTerrain(elevMap[k], tempMap[k], moistMap[k], seaLevel, highlandRate, altMap[k]),
      }
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
