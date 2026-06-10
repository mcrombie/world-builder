import type { HexData, LayerVisibility, RegionData, TerrainType } from '../types/map'

export interface TutorialCompletionState {
  selectedHex: HexData | null
  selectedRegion: RegionData | null
  selectedRegionId: string | null
  isSimulating: boolean
  simTurn: number
  currentPath: string | null
  terrainsExplored: Set<TerrainType>
  simStartTurn: number
}

export interface TutorialStep {
  id: string
  title: string
  eyebrow: string
  prose: string[]
  action: string
  layers: Partial<LayerVisibility>
  selectMode: 'tile' | 'region'
  isComplete: (state: TutorialCompletionState) => boolean
}

const OCEAN_TYPES = new Set<TerrainType>(['ocean', 'coast', 'lake'])

export const TUTORIAL_STEPS: TutorialStep[] = [
  // ── Step 1: Welcome ──────────────────────────────────────────────────────────
  {
    id: 'welcome',
    title: 'Welcome to Azhora',
    eyebrow: 'Step 1 of 9 — The Stage',
    prose: [
      'Clashvergence is a historical simulation. Given a map, it generates factions, lets them grow and compete, and watches centuries of history emerge — wars, famines, migrations, the rise and fall of empires.',
      'The map you\'re looking at is Azhora, a continent on the planet Corav. This is how the simulation sees the world: a grid of hexes, each with terrain, climate, resources, and history waiting to happen.',
      'Every hex matters. Pan with the middle mouse button or scroll to zoom. Click any land hex to continue.',
    ],
    action: 'Click any land hex to continue',
    layers: { terrain: true, climate: false, regions: false, factions: false, settlements: false, grid: false, rivers: true, underlay: false },
    selectMode: 'tile',
    isComplete: (s) => s.selectedHex !== null && !OCEAN_TYPES.has(s.selectedHex.terrain),
  },

  // ── Step 2: Terrain ──────────────────────────────────────────────────────────
  {
    id: 'terrain',
    title: 'How Terrain Shapes History',
    eyebrow: 'Step 2 of 9 — The Land',
    prose: [
      'Every hex has a terrain type. Plains and grassland produce grain — the foundation of every civilization\'s food supply. Forests yield timber for ships and construction. Hills shelter livestock and hold deposits of copper and iron.',
      'Coastline opens trade routes. Mountains contain the stone and precious metals that fund armies. Jungle is rich but difficult — disease and density make it hard to exploit without the right technology.',
      'The terrain of a region determines what it can produce and, therefore, how much a faction wants to own it.',
    ],
    action: 'Click 3 different terrain types to explore them',
    layers: { terrain: true, climate: false, regions: false, factions: false, settlements: false, grid: false, rivers: true, underlay: false },
    selectMode: 'tile',
    isComplete: (s) => s.terrainsExplored.size >= 3,
  },

  // ── Step 3: Climate ──────────────────────────────────────────────────────────
  {
    id: 'climate',
    title: 'Climate and the Köppen System',
    eyebrow: 'Step 3 of 9 — The Sky',
    prose: [
      'Two forests in different climates are not the same resource. A tropical rainforest (Af) produces very different goods than a continental boreal forest (Dfc) — and a desert grassland (BWh) barely grows grain at all.',
      'Clashvergence uses Köppen climate codes to modify every resource yield. The climate layer is now visible. Cooler colours are cold and dry; warmer colours are hot or tropical. Temperate zones (Cfb, Cfa) are the most productive overall.',
      'Click a hex outside the temperate green zones to see what a harsher climate looks like.',
    ],
    action: 'Click a hex in a non-temperate climate zone',
    layers: { terrain: true, climate: true, regions: false, factions: false, settlements: false, grid: false, rivers: true, underlay: false },
    selectMode: 'tile',
    isComplete: (s) => s.selectedHex !== null && !OCEAN_TYPES.has(s.selectedHex.terrain) && s.selectedHex.climate != null && !s.selectedHex.climate.startsWith('Cf'),
  },

  // ── Step 4: Regions ──────────────────────────────────────────────────────────
  {
    id: 'regions',
    title: 'Regions — Units of Territory',
    eyebrow: 'Step 4 of 9 — The Map',
    prose: [
      'The continent is divided into named regions — each one a unit of territory a faction can own. Regions group hexes together into meaningful places: a river valley, a highland plateau, a stretch of coastline.',
      'Ownership comes in three grades. A faction\'s homeland receives full income and strong loyalty. Core territory is partially integrated — producing well but not yet fully assimilated. Frontier territory is a light grip — cheap to hold, prone to secession if the faction weakens.',
      'Expansion is fast. Integration takes decades.',
    ],
    action: 'Click on the map to select any region',
    layers: { terrain: true, climate: false, regions: true, factions: false, settlements: false, grid: false, rivers: true, underlay: false },
    selectMode: 'region',
    isComplete: (s) => s.selectedRegion !== null,
  },

  // ── Step 5: Factions ─────────────────────────────────────────────────────────
  {
    id: 'factions',
    title: 'Factions — Who Will Rule',
    eyebrow: 'Step 5 of 9 — The Peoples',
    prose: [
      'Factions are the simulation\'s actors. Each begins in a homeland you define on the map. They expand from there, driven by their doctrine — a strategic personality shaped by their home terrain and climate.',
      'A faction born in mountain highlands will prioritise horses, iron, and defensible positions. One from rich riverland plains will pursue grain surpluses, trade networks, and population growth. Neither approach is universally right; the map determines what works.',
      'Coloured regions show faction starting territories. Click a coloured region to see which faction it belongs to.',
    ],
    action: 'Click a faction-coloured region',
    layers: { terrain: true, climate: false, regions: true, factions: true, settlements: false, grid: false, rivers: true, underlay: false },
    selectMode: 'region',
    isComplete: (s) => s.selectedRegion?.faction !== undefined && s.selectedRegion.faction !== null,
  },

  // ── Step 6: Resources ────────────────────────────────────────────────────────
  {
    id: 'resources',
    title: 'Resources and Economy',
    eyebrow: 'Step 6 of 9 — What the Land Yields',
    prose: [
      'Clashvergence tracks 11 resource types. Domesticable resources — grain, livestock, horses, textiles — require active cultivation. Wild resources — food, timber — can be gathered directly. Extractive resources — copper, iron, gold, stone, salt — must be mined.',
      'Resources combine into production chains: tools, iron goods, weapons, provisions, ships, urban surplus. A faction with iron but no timber cannot build a navy. One with grain but no iron cannot arm its soldiers properly.',
      'The more production chains a faction can complete, the more it can field armies, fund trade, and sustain a large empire.',
    ],
    action: 'Click a plains or grassland hex to see what the most productive land looks like',
    layers: { terrain: true, climate: false, regions: true, factions: false, settlements: false, grid: false, rivers: true, underlay: false },
    selectMode: 'tile',
    isComplete: (s) => s.selectedHex !== null && (s.selectedHex.terrain === 'grassland' || s.selectedHex.terrain === 'plains'),
  },

  // ── Step 7: Simulation ───────────────────────────────────────────────────────
  {
    id: 'simulate',
    title: 'Starting the Simulation',
    eyebrow: 'Step 7 of 9 — The Engine',
    prose: [
      'Each simulated year, every faction evaluates its position and picks one action: expand into an adjacent hex, attack an enemy, develop their existing regions to improve production, or skip and consolidate.',
      'These choices are driven by treasury, military readiness, food security, doctrine, and diplomacy. A faction running a food deficit will not expand. One with a large army but an empty treasury will struggle to sustain a campaign.',
      'Save the map first, then click Simulate in the toolbar to start. You\'ll be able to choose the number of factions and a seed.',
    ],
    action: 'Save the map (Ctrl+S), then click Simulate in the toolbar',
    layers: { terrain: true, climate: false, regions: true, factions: true, settlements: true, grid: false, rivers: true, underlay: false },
    selectMode: 'region',
    isComplete: (s) => {
      const isSaved = s.currentPath !== null && !s.currentPath.startsWith('__')
      return isSaved && s.isSimulating
    },
  },

  // ── Step 8: Watching history ─────────────────────────────────────────────────
  {
    id: 'watch',
    title: 'The Turn in Motion',
    eyebrow: 'Step 8 of 9 — History Unfolding',
    prose: [
      'Watch the Event Log in the Simulation Panel. Each turn records what happened: borders shifted, a battle was fought, a famine struck, a new faction seceded from a weakening empire.',
      'Watch for patterns. Factions with grain surpluses expand aggressively in the early turns. Those with military doctrines pick fights before rivals can consolidate. Those in resource-poor homelands either die early or adapt into raiders.',
      'Advance at least 5 turns to see the opening moves take shape.',
    ],
    action: 'Advance the simulation at least 5 turns',
    layers: { terrain: true, climate: false, regions: true, factions: true, settlements: true, grid: false, rivers: true, underlay: false },
    selectMode: 'region',
    isComplete: (s) => s.simTurn >= s.simStartTurn + 5,
  },

  // ── Step 9: Long arc ─────────────────────────────────────────────────────────
  {
    id: 'longarc',
    title: 'The Long Arc',
    eyebrow: 'Step 9 of 9 — Centuries',
    prose: [
      'The early turns are about expansion. Later, subtler systems take over. Technology diffuses from advanced regions to neighbours, changing what each can produce and how well they can fight. Religions spread across borders and sometimes fracture into competing sects.',
      'Elite blocs form — administrative, military, merchant, clerical — and begin to contest the faction\'s direction. A military elite will push for wars the treasury cannot sustain. A merchant bloc will resist campaigns that disrupt trade.',
      'Rulers die. Heirs inherit unstable moments. Ideologies emerge from accumulated grievances and aspirations. Clashvergence does not script these stories — it generates them.',
    ],
    action: 'Click Finish to return to the editor',
    layers: { terrain: true, climate: false, regions: true, factions: true, settlements: true, grid: false, rivers: true, underlay: false },
    selectMode: 'region',
    isComplete: () => true,
  },
]
