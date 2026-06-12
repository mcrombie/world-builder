import { useRef, useEffect, useCallback } from 'react'
import { useMapStore } from '../store/mapStore'
import {
  hexToPixel, pixelToHex, hexCorners, hexKey, hexesInRadius, AxialCoord,
  riverEdgeKey, parseRiverEdge, NEIGHBOR_TO_EDGE_SLOT, HEX_NEIGHBORS,
} from '../lib/hex'
import { TERRAIN_COLORS, CLIMATE_COLORS } from '../lib/terrain'
import { FactionData, HexData, RegionData, RiverSize, SimActiveWar, SimWorldState } from '../types/map'
import { SelectMode } from '../types/map'
import { buildFactionColorMap } from './SimulationPanel'

interface ViewState {
  offsetX: number
  offsetY: number
  zoom: number
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
const REGION_LABEL_MIN_ZOOM = 0.72
const REGION_LABEL_FADE_ZOOM_RANGE = 0.18
const FACTION_LABEL_FONT_SIZE = 18
const FACTION_LABEL_STROKE_WIDTH = 4.8
const SETTLEMENT_DOT_RADIUS: Record<string, number> = {
  village: 2, town: 3, city: 4, capital: 5,
}

export function HexCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef<ViewState>({ offsetX: 100, offsetY: 100, zoom: 1 })
  const isPainting       = useRef(false)
  const isPanning        = useRef(false)
  const lastMouse        = useRef({ x: 0, y: 0 })
  const underlayImg      = useRef<HTMLImageElement | null>(null)
  const rafRef           = useRef<number>(0)
  const needsRedraw      = useRef(true)
  const panAnim = useRef<{ fromX: number; fromY: number; toX: number; toY: number; t0: number; dur: number } | null>(null)

  const map             = useMapStore((s) => s.map)
  const mapVersion      = useMapStore((s) => s.mapVersion)
  const mapRef          = useRef(map)
  const layers          = useMapStore((s) => s.layers)
  const selectedHex     = useMapStore((s) => s.selectedHex)
  const selectedRegion  = useMapStore((s) => s.selectedRegion)
  const selectedFaction = useMapStore((s) => s.selectedFaction)
  const selectMode      = useMapStore((s) => s.selectMode)
  const activeTool      = useMapStore((s) => s.activeTool)
  const brushRadius     = useMapStore((s) => s.brushRadius)
  const activeRegion    = useMapStore((s) => s.activeRegion)
  const activeClimate    = useMapStore((s) => s.activeClimate)
  const beginStroke      = useMapStore((s) => s.beginStroke)
  const paintHex         = useMapStore((s) => s.paintHex)
  const paintRegionHex   = useMapStore((s) => s.paintRegionHex)
  const paintClimateHex  = useMapStore((s) => s.paintClimateHex)
  const paintFactionHex  = useMapStore((s) => s.paintFactionHex)
  const activeFaction    = useMapStore((s) => s.activeFaction)
  const endStroke        = useMapStore((s) => s.endStroke)
  const selectHex       = useMapStore((s) => s.selectHex)
  const selectRegion    = useMapStore((s) => s.selectRegion)
  const setSimDetailSelection = useMapStore((s) => s.setSimDetailSelection)
  const toggleRiverEdge = useMapStore((s) => s.toggleRiverEdge)
  const simWorld        = useMapStore((s) => s.simWorld)
  const isSimulating    = useMapStore((s) => s.isSimulating)
  const simDetailSelection = useMapStore((s) => s.simDetailSelection)
  const simWorldRef     = useRef<SimWorldState | null>(simWorld)
  const isSimRef        = useRef(isSimulating)
  const simDetailSelectionRef = useRef(simDetailSelection)
  simWorldRef.current   = simWorld
  isSimRef.current      = isSimulating
  simDetailSelectionRef.current = simDetailSelection

  const hoverCoord        = useRef<AxialCoord | null>(null)
  const hoverRiverEdge    = useRef<string | null>(null)
  const isRiverDrawing    = useRef(false)
  const riverDrawMode     = useRef<'add' | 'remove'>('add')
  const lastRiverEdgeRef  = useRef<string | null>(null)
  const activeToolRef     = useRef(activeTool)
  const brushRadiusRef    = useRef(brushRadius)
  const activeRegionRef   = useRef(activeRegion)
  const activeClimateRef  = useRef(activeClimate)
  const activeFactionRef  = useRef(activeFaction)
  const selectModeRef     = useRef(selectMode)
  activeToolRef.current    = activeTool
  brushRadiusRef.current   = brushRadius
  activeRegionRef.current  = activeRegion
  activeClimateRef.current = activeClimate
  activeFactionRef.current = activeFaction
  selectModeRef.current   = selectMode
  mapRef.current          = map

  useEffect(() => {
    if (!map?.underlayPath) { underlayImg.current = null; needsRedraw.current = true; return }
    const img = new Image()
    img.onload = () => { underlayImg.current = img; needsRedraw.current = true }
    img.src = map.underlayPath
  }, [map?.underlayPath])

  useEffect(() => { needsRedraw.current = true }, [map, layers, selectedHex, selectedRegion, selectedFaction, brushRadius, activeTool, activeRegion, activeClimate, activeFaction, simWorld, isSimulating, simDetailSelection])

  // ── Render ────────────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !map) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { offsetX, offsetY, zoom } = view.current
    const { hexSize, hexes, regions } = map

    const viewL = -offsetX / zoom
    const viewT = -offsetY / zoom
    const viewR = (canvas.width  - offsetX) / zoom
    const viewB = (canvas.height - offsetY) / zoom
    const cullPad = hexSize * 2

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.setTransform(zoom, 0, 0, zoom, offsetX, offsetY)

    // ── Underlay ──────────────────────────────────────────────────────────────
    if (layers.underlay && underlayImg.current) {
      const hSpacing = Math.sqrt(3) * hexSize
      ctx.globalAlpha = 0.45
      ctx.drawImage(
        underlayImg.current,
        -hSpacing / 2, -hexSize,
        map.width * hSpacing + hSpacing / 2,
        (map.height - 1) * hexSize * 1.5 + hexSize * 2,
      )
      ctx.globalAlpha = 1
    }

    // ── Terrain fill ──────────────────────────────────────────────────────────
    if (layers.terrain) {
      ctx.globalAlpha = 0.55
      for (const hex of Object.values(hexes)) {
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        drawHexFill(ctx, cx, cy, hexSize, TERRAIN_COLORS[hex.terrain])
      }
      ctx.globalAlpha = 1
    }

    // ── Climate fill ─────────────────────────────────────────────────────────
    if (layers.climate) {
      ctx.globalAlpha = 0.55
      for (const hex of Object.values(hexes)) {
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        drawHexFill(ctx, cx, cy, hexSize, CLIMATE_COLORS[hex.climate])
      }
      ctx.globalAlpha = 1
    }

    // ── Simulation faction overlay + territory labels ─────────────────────────
    if (isSimRef.current && simWorldRef.current) {
      const factionColors = buildFactionColorMap(simWorldRef.current.factions)
      const factionLabels: Record<string, string> = {}
      for (const f of simWorldRef.current.factions) {
        factionLabels[f.name] = f.display_name.startsWith('The ') ? f.display_name.slice(4) : f.display_name
      }
      const regionOwnerMap: Record<string, string | null> = {}
      for (const r of simWorldRef.current.regions) {
        regionOwnerMap[r.name] = r.owner
      }
      const activeWars = simWorldRef.current.active_wars ?? []
      const warTargetSet = new Set<string>()
      const warAggressorMap: Record<string, string> = {}
      for (const war of activeWars) {
        if (!war.target_region) continue
        warTargetSet.add(war.target_region)
        warAggressorMap[war.target_region] = war.aggressor
      }
      const selectedSimFaction = simDetailSelectionRef.current?.type === 'faction'
        ? simDetailSelectionRef.current.factionName
        : null

      // Colour fill + centroid accumulation
      const centroids: Record<string, { x: number; y: number; n: number }> = {}
      ctx.globalAlpha = 0.6
      for (const hex of Object.values(hexes)) {
        if (!hex.region) continue
        if (!(hex.region in regionOwnerMap)) continue
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        const owner = regionOwnerMap[hex.region]
        drawHexFill(ctx, cx, cy, hexSize, owner ? (factionColors[owner] ?? '#888888') : '#5a5a6e')
        if (owner) {
          const c = centroids[owner] ?? (centroids[owner] = { x: 0, y: 0, n: 0 })
          c.x += cx; c.y += cy; c.n++
        }
      }
      ctx.globalAlpha = 1

      if (selectedSimFaction) {
        const highlightColor = factionColors[selectedSimFaction] ?? '#ffffff'
        ctx.globalAlpha = 0.9
        for (const hex of Object.values(hexes)) {
          if (!hex.region || regionOwnerMap[hex.region] !== selectedSimFaction) continue
          const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
          if (cx + cullPad < viewL || cx - cullPad > viewR) continue
          if (cy + cullPad < viewT || cy - cullPad > viewB) continue
          drawHexFill(ctx, cx, cy, hexSize, highlightColor)
        }
        ctx.globalAlpha = 1

        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        for (const hex of Object.values(hexes)) {
          if (!hex.region || regionOwnerMap[hex.region] !== selectedSimFaction) continue
          const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
          if (cx + cullPad < viewL || cx - cullPad > viewR) continue
          if (cy + cullPad < viewT || cy - cullPad > viewB) continue

          const corners = hexCorners(cx, cy, hexSize)
          for (let d = 0; d < 6; d++) {
            const nq = hex.q + HEX_NEIGHBORS[d].q
            const nr = hex.r + HEX_NEIGHBORS[d].r
            const neighbor = hexes[hexKey(nq, nr)]
            const neighborOwner = neighbor?.region ? regionOwnerMap[neighbor.region] : null
            if (neighborOwner === selectedSimFaction) continue

            const slot = NEIGHBOR_TO_EDGE_SLOT[d]
            const [x1, y1] = corners[slot]
            const [x2, y2] = corners[(slot + 1) % 6]
            ctx.strokeStyle = 'rgba(255,255,255,0.88)'
            ctx.lineWidth = Math.max(2.2, hexSize * 0.22) / zoom
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()
            ctx.strokeStyle = highlightColor
            ctx.lineWidth = Math.max(1.2, hexSize * 0.11) / zoom
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()
          }
        }
      }

      // Territory name labels — drawn in screen space so size is always readable
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)   // identity: switch to screen pixels
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `800 ${FACTION_LABEL_FONT_SIZE}px system-ui, sans-serif`
      ctx.lineJoin = 'round'
      ctx.lineWidth = FACTION_LABEL_STROKE_WIDTH
      for (const [owner, c] of Object.entries(centroids)) {
        if (c.n < 3) continue
        // world → screen
        const sx = (c.x / c.n) * zoom + offsetX
        const sy = (c.y / c.n) * zoom + offsetY
        if (sx < -60 || sx > canvas.width + 60) continue
        if (sy < -20 || sy > canvas.height + 20) continue
        const label = factionLabels[owner] ?? owner
        ctx.strokeStyle = 'rgba(0,0,0,0.9)'
        ctx.strokeText(label, sx, sy)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, sx, sy)
      }
      ctx.restore()

      if (layers.wars && warTargetSet.size > 0) {
        const t = performance.now() / 1000
        const pulseAlpha = 0.18 + 0.20 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 1.4))

        ctx.globalAlpha = pulseAlpha
        for (const hex of Object.values(hexes)) {
          if (!hex.region || !warTargetSet.has(hex.region)) continue
          const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
          if (cx + cullPad < viewL || cx - cullPad > viewR) continue
          if (cy + cullPad < viewT || cy - cullPad > viewB) continue
          const aggressor = warAggressorMap[hex.region]
          const color = aggressor ? (factionColors[aggressor] ?? '#ff2222') : '#ff2222'
          drawHexFill(ctx, cx, cy, hexSize, color)
        }
        ctx.globalAlpha = 1

        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        for (const hex of Object.values(hexes)) {
          if (!hex.region || !warTargetSet.has(hex.region)) continue
          const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
          if (cx + cullPad < viewL || cx - cullPad > viewR) continue
          if (cy + cullPad < viewT || cy - cullPad > viewB) continue
          const corners = hexCorners(cx, cy, hexSize)
          const aggressor = warAggressorMap[hex.region]
          const borderColor = aggressor ? (factionColors[aggressor] ?? '#ff2222') : '#ff2222'
          ctx.strokeStyle = borderColor
          ctx.lineWidth = Math.max(2.0, hexSize * 0.16) / zoom
          for (let d = 0; d < 6; d++) {
            const nq = hex.q + HEX_NEIGHBORS[d].q
            const nr = hex.r + HEX_NEIGHBORS[d].r
            const neighbor = hexes[hexKey(nq, nr)]
            if (neighbor?.region === hex.region) continue
            const slot = NEIGHBOR_TO_EDGE_SLOT[d]
            const [x1, y1] = corners[slot]
            const [x2, y2] = corners[(slot + 1) % 6]
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()
          }
        }
      }

      const warCentroids: Array<{
        war: SimActiveWar
        cx: number
        cy: number
      }> = []

      for (const war of activeWars) {
        if (!war.target_region) continue
        let sumX = 0
        let sumY = 0
        let count = 0
        for (const hex of Object.values(hexes)) {
          if (hex.region !== war.target_region) continue
          const [hx, hy] = hexToPixel(hex.q, hex.r, hexSize)
          sumX += hx
          sumY += hy
          count += 1
        }
        if (count === 0) continue
        warCentroids.push({ war, cx: sumX / count, cy: sumY / count })
      }

      if (warCentroids.length > 0) {
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)

        for (const { war, cx: worldX, cy: worldY } of warCentroids) {
          const sx = worldX * zoom + offsetX
          const sy = worldY * zoom + offsetY
          if (sx < -30 || sx > canvas.width + 30) continue
          if (sy < -30 || sy > canvas.height + 30) continue

          const aggressorColor = factionColors[war.aggressor] ?? '#ff4444'
          const defenderColor = factionColors[war.defender] ?? '#888888'
          const markerR = 10

          ctx.beginPath()
          ctx.arc(sx, sy, markerR + 3, 0, Math.PI * 2)
          ctx.strokeStyle = defenderColor
          ctx.lineWidth = 2.5
          ctx.stroke()

          ctx.beginPath()
          ctx.arc(sx, sy, markerR, 0, Math.PI * 2)
          ctx.fillStyle = aggressorColor
          ctx.fill()

          ctx.beginPath()
          ctx.arc(sx, sy, markerR, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(0,0,0,0.7)'
          ctx.lineWidth = 1.5
          ctx.stroke()

          if (zoom > 0.55) {
            const label = `${factionLabels[war.aggressor] ?? war.aggressor} vs ${factionLabels[war.defender] ?? war.defender}`
            ctx.font = '700 11px system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.lineWidth = 3
            ctx.strokeStyle = 'rgba(0,0,0,0.9)'
            ctx.strokeText(label, sx, sy + markerR + 5)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(label, sx, sy + markerR + 5)
          }
        }

        ctx.restore()
      }
    }

    // ── Region fill + borders ─────────────────────────────────────────────────
    if (layers.regions) {
      // Soft tint per region; labels carry the layer, color only separates areas.
      ctx.globalAlpha = 0.08
      for (const hex of Object.values(hexes)) {
        if (!hex.region) continue
        const rd = regions[hex.region]
        if (!rd) continue
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        drawHexFill(ctx, cx, cy, hexSize, rd.color)
      }
      ctx.globalAlpha = 1

      // Borders: draw an edge wherever adjacent hexes belong to different regions
      ctx.lineCap = 'round'
      ctx.globalAlpha = 0.38
      for (const hex of Object.values(hexes)) {
        if (!hex.region) continue
        const rd = regions[hex.region]
        if (!rd) continue
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        const corners = hexCorners(cx, cy, hexSize)
        ctx.strokeStyle = rd.color
        ctx.lineWidth = Math.max(0.9, hexSize * 0.07) / zoom
        for (let d = 0; d < 6; d++) {
          const nq = hex.q + HEX_NEIGHBORS[d].q
          const nr = hex.r + HEX_NEIGHBORS[d].r
          const neighbor = hexes[hexKey(nq, nr)]
          if (neighbor?.region === hex.region) continue  // same region — no border
          const slot = NEIGHBOR_TO_EDGE_SLOT[d]
          const [x1, y1] = corners[slot]
          const [x2, y2] = corners[(slot + 1) % 6]
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      // Region labels are drawn at the end so text remains the primary cue.
    }

    // ── Faction overlay (manual, non-simulation) ─────────────────────────────
    if (layers.factions && mapRef.current?.factions && !isSimRef.current) {
      const mapFactions: Record<string, FactionData> = mapRef.current.factions
      // Translucent fill per faction
      ctx.globalAlpha = 0.30
      for (const hex of Object.values(hexes)) {
        if (!hex.region) continue
        const factionId = regions[hex.region]?.faction
        if (!factionId) continue
        const fd = mapFactions[factionId]
        if (!fd) continue
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        drawHexFill(ctx, cx, cy, hexSize, fd.color)
      }
      ctx.globalAlpha = 1

      // Thick borders between different factions
      ctx.lineCap = 'round'
      for (const hex of Object.values(hexes)) {
        if (!hex.region) continue
        const factionId = regions[hex.region]?.faction
        if (!factionId) continue
        const fd = mapFactions[factionId]
        if (!fd) continue
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        const corners = hexCorners(cx, cy, hexSize)
        ctx.strokeStyle = fd.color
        ctx.lineWidth = Math.max(2.5, hexSize * 0.18) / zoom
        for (let d = 0; d < 6; d++) {
          const nq = hex.q + HEX_NEIGHBORS[d].q
          const nr = hex.r + HEX_NEIGHBORS[d].r
          const neighbor = hexes[hexKey(nq, nr)]
          const neighborFactionId = neighbor?.region ? regions[neighbor.region]?.faction : undefined
          if (neighborFactionId === factionId) continue
          const slot = NEIGHBOR_TO_EDGE_SLOT[d]
          const [x1, y1] = corners[slot]
          const [x2, y2] = corners[(slot + 1) % 6]
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
        }
      }

      // Faction name labels at centroid of each faction's territory
      const factionCentroids: Record<string, { x: number; y: number; n: number }> = {}
      for (const hex of Object.values(hexes)) {
        if (!hex.region) continue
        const fid = regions[hex.region]?.faction
        if (!fid || !mapRef.current!.factions![fid]) continue
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        const c = factionCentroids[fid] ?? (factionCentroids[fid] = { x: 0, y: 0, n: 0 })
        c.x += cx; c.y += cy; c.n++
      }
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `800 ${FACTION_LABEL_FONT_SIZE}px system-ui, sans-serif`
      ctx.lineJoin = 'round'
      ctx.lineWidth = FACTION_LABEL_STROKE_WIDTH
      for (const [fid, c] of Object.entries(factionCentroids)) {
        if (c.n < 3) continue
        const sx = (c.x / c.n) * zoom + offsetX
        const sy = (c.y / c.n) * zoom + offsetY
        if (sx < -60 || sx > canvas.width + 60) continue
        if (sy < -20 || sy > canvas.height + 20) continue
        const label = mapRef.current!.factions![fid].name
        ctx.strokeStyle = 'rgba(0,0,0,0.9)'
        ctx.strokeText(label, sx, sy)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, sx, sy)
      }
      ctx.restore()
    }

    // ── Grid lines ────────────────────────────────────────────────────────────
    if (layers.grid && zoom > 0.15) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 0.5 / zoom
      for (const hex of Object.values(hexes)) {
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        strokeHex(ctx, cx, cy, hexSize)
      }
    }

    // ── Settlements ───────────────────────────────────────────────────────────
    if (layers.settlements) {
      for (const hex of Object.values(hexes)) {
        if (!hex.settlement) continue
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        drawSettlement(ctx, cx, cy, hex, hexSize, zoom)
      }
    }

    // ── Rivers ───────────────────────────────────────────────────────────────
    const riverEntries = Object.entries(map.rivers ?? {})
    if (layers.rivers && riverEntries.length) {
      ctx.strokeStyle = '#3b9eff'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const [ek, riverSize] of riverEntries) {
        ctx.lineWidth = riverLineWidth(riverSize, hexSize, zoom)
        const [a, b] = parseRiverEdge(ek)
        const d = HEX_NEIGHBORS.findIndex(n => n.q === b.q - a.q && n.r === b.r - a.r)
        if (d === -1) continue
        const [cx, cy] = hexToPixel(a.q, a.r, hexSize)
        const corners = hexCorners(cx, cy, hexSize)
        const slot = NEIGHBOR_TO_EDGE_SLOT[d]
        const [x1, y1] = corners[slot]
        const [x2, y2] = corners[(slot + 1) % 6]
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
    }

    // ── River hover preview ───────────────────────────────────────────────────
    const hre = hoverRiverEdge.current
    if (hre && activeToolRef.current === 'river') {
      const [a, b] = parseRiverEdge(hre)
      const d = HEX_NEIGHBORS.findIndex(n => n.q === b.q - a.q && n.r === b.r - a.r)
      if (d !== -1) {
        const alreadyRiver = hre in (map.rivers ?? {})
        const [cx, cy] = hexToPixel(a.q, a.r, hexSize)
        const corners = hexCorners(cx, cy, hexSize)
        const slot = NEIGHBOR_TO_EDGE_SLOT[d]
        const [x1, y1] = corners[slot]
        const [x2, y2] = corners[(slot + 1) % 6]
        ctx.strokeStyle = alreadyRiver ? '#ff6666' : '#88ccff'
        ctx.lineWidth = Math.max(2.5, hexSize * 0.25) / zoom
        ctx.lineCap = 'round'
        ctx.globalAlpha = 0.8
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }

    // ── Selected hex highlight ────────────────────────────────────────────────
    if (selectedHex && hexes[selectedHex]) {
      const h = hexes[selectedHex]
      const [cx, cy] = hexToPixel(h.q, h.r, hexSize)
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 2 / zoom
      strokeHex(ctx, cx, cy, hexSize)
      ctx.strokeStyle = 'rgba(180,190,200,0.6)'
      ctx.lineWidth = 1 / zoom
      strokeHex(ctx, cx, cy, hexSize * 0.85)
    }

    // ── Selected region highlight ─────────────────────────────────────────────
    if (selectedRegion) {
      ctx.strokeStyle = 'rgba(220,220,215,0.55)'
      ctx.lineWidth = 2 / zoom
      for (const hex of Object.values(hexes)) {
        if (hex.region !== selectedRegion) continue
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        strokeHex(ctx, cx, cy, hexSize)
      }
    }

    // ── Faction-paint hover preview (highlights entire hovered region) ───────
    if (hoverCoord.current && activeToolRef.current === 'faction') {
      const hKey = hexKey(hoverCoord.current.q, hoverCoord.current.r)
      const hoveredRegionId = hexes[hKey]?.region
      if (hoveredRegionId) {
        const af = activeFactionRef.current
        const previewColor = af && mapRef.current?.factions?.[af]
          ? (mapRef.current.factions[af] as FactionData).color
          : '#ff6666'
        ctx.globalAlpha = 0.45
        for (const hex of Object.values(hexes)) {
          if (hex.region !== hoveredRegionId) continue
          const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
          drawHexFill(ctx, cx, cy, hexSize, previewColor)
        }
        ctx.globalAlpha = 1
        ctx.strokeStyle = previewColor
        ctx.lineWidth = 1.5 / zoom
        for (const hex of Object.values(hexes)) {
          if (hex.region !== hoveredRegionId) continue
          const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
          strokeHex(ctx, cx, cy, hexSize)
        }
      }
    }

    // ── Brush / region-paint hover preview ────────────────────────────────────
    const tool = activeToolRef.current
    const hc   = hoverCoord.current
    if (hc && (tool === 'paint' || tool === 'erase' || tool === 'region' || tool === 'climate')) {
      const radius = brushRadiusRef.current
      const previewColor =
        tool === 'erase'   ? '#ff6666' :
        tool === 'region'  ? (activeRegionRef.current ? (map.regions[activeRegionRef.current]?.color ?? '#ffffff') : '#ff6666') :
        tool === 'climate' ? CLIMATE_COLORS[activeClimateRef.current] :
        '#ffffff'
      const affected = hexesInRadius(hc.q, hc.r, radius).filter(
        ({ q: pq, r: pr }) => hexKey(pq, pr) in hexes
      )
      ctx.globalAlpha = 0.3
      for (const { q: pq, r: pr } of affected) {
        const [cx, cy] = hexToPixel(pq, pr, hexSize)
        drawHexFill(ctx, cx, cy, hexSize, previewColor)
      }
      ctx.globalAlpha = 1
      ctx.strokeStyle = previewColor
      ctx.lineWidth = 1.5 / zoom
      for (const { q: pq, r: pr } of affected) {
        const [cx, cy] = hexToPixel(pq, pr, hexSize)
        strokeHex(ctx, cx, cy, hexSize)
      }
    }

    if (layers.regions) {
      drawRegionLabels(
        ctx, hexes, regions, hexSize, zoom, offsetX, offsetY,
        canvas.width, canvas.height, viewL, viewT, viewR, viewB, cullPad,
      )
    }

    ctx.restore()
  }, [map, layers, selectedHex, selectedRegion, activeRegion])

  // ── RAF loop ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => {
      // Smooth pan animation
      const anim = panAnim.current
      if (anim) {
        const t = Math.min((performance.now() - anim.t0) / anim.dur, 1)
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t  // ease-in-out
        view.current.offsetX = anim.fromX + (anim.toX - anim.fromX) * ease
        view.current.offsetY = anim.fromY + (anim.toY - anim.fromY) * ease
        needsRedraw.current = true
        if (t >= 1) panAnim.current = null
      }

      const world = simWorldRef.current
      if (
        layers.wars &&
        isSimRef.current &&
        world?.active_wars &&
        world.active_wars.length > 0
      ) {
        needsRedraw.current = true
      }

      if (needsRedraw.current) {
        try { render() } catch (e) { console.error('HexCanvas render error:', e) }
        needsRedraw.current = false
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [render])

  // ── Resize observer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      needsRedraw.current = true
    })
    ro.observe(canvas)
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    return () => ro.disconnect()
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const fitView = useCallback(() => {
    const canvas = canvasRef.current
    const m = mapRef.current
    if (!canvas || !m) return
    const cw = canvas.width
    const ch = canvas.height
    if (cw === 0 || ch === 0) return
    const { width, height, hexSize } = m
    const hSpacing   = Math.sqrt(3) * hexSize
    const worldLeft  = -hSpacing / 2
    const worldTop   = -hexSize
    const worldW     = width  * hSpacing + hSpacing / 2
    const worldH     = (height - 1) * hexSize * 1.5 + hexSize * 2
    const pad        = 0.05
    const zoom       = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM,
      Math.min((cw * (1 - pad * 2)) / worldW, (ch * (1 - pad * 2)) / worldH)
    ))
    view.current = {
      zoom,
      offsetX: cw / 2 - (worldLeft + worldW / 2) * zoom,
      offsetY: ch / 2 - (worldTop  + worldH / 2) * zoom,
    }
    needsRedraw.current = true
  }, [])

  useEffect(() => {
    if (mapVersion === 0) return
    // defer one frame so the canvas has its pixel dimensions
    const id = requestAnimationFrame(fitView)
    return () => cancelAnimationFrame(id)
  }, [mapVersion, fitView])

  // ── Pan to selected region ────────────────────────────────────────────────────
  const panToHexes = useCallback((targetHexes: HexData[], hexSize: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (targetHexes.length === 0) return

    let sumX = 0, sumY = 0
    for (const h of targetHexes) {
      const [px, py] = hexToPixel(h.q, h.r, hexSize)
      sumX += px; sumY += py
    }
    const centX = sumX / targetHexes.length
    const centY = sumY / targetHexes.length

    const { zoom } = view.current
    panAnim.current = {
      fromX: view.current.offsetX,
      fromY: view.current.offsetY,
      toX:   canvas.width  / 2 - centX * zoom,
      toY:   canvas.height / 2 - centY * zoom,
      t0:    performance.now(),
      dur:   420,
    }
    needsRedraw.current = true
  }, [])

  useEffect(() => {
    if (!selectedRegion || !mapRef.current) return
    const { hexes, hexSize } = mapRef.current
    const regionHexes = Object.values(hexes).filter(h => h.region === selectedRegion)
    panToHexes(regionHexes, hexSize)
  }, [selectedRegion, panToHexes])

  useEffect(() => {
    if (!selectedFaction || isSimRef.current || !mapRef.current) return
    const { hexes, regions, hexSize } = mapRef.current
    const factionHexes = Object.values(hexes).filter(h => h.region && regions[h.region]?.faction === selectedFaction)
    panToHexes(factionHexes, hexSize)
  }, [selectedFaction, panToHexes])

  useEffect(() => {
    if (simDetailSelection?.type !== 'faction') return
    const world = simWorldRef.current
    const m = mapRef.current
    if (!world || !m) return

    const ownedRegionNames = new Set<string>()
    for (const region of world.regions) {
      if (region.owner !== simDetailSelection.factionName) continue
      ownedRegionNames.add(region.name)
      ownedRegionNames.add(region.display_name)
    }
    if (ownedRegionNames.size === 0) return

    const factionHexes = Object.values(m.hexes).filter((h) => {
      if (!h.region) return false
      const mapRegion = m.regions[h.region]
      return ownedRegionNames.has(h.region) || (mapRegion ? ownedRegionNames.has(mapRegion.name) : false)
    })
    panToHexes(factionHexes, m.hexSize)
  }, [simDetailSelection, panToHexes])

  const screenToWorld = useCallback((sx: number, sy: number): [number, number] => {
    const { offsetX, offsetY, zoom } = view.current
    return [(sx - offsetX) / zoom, (sy - offsetY) / zoom]
  }, [])

  const hexAtScreen = useCallback(
    (clientX: number, clientY: number) => {
      if (!map) return null
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const [wx, wy] = screenToWorld(clientX - rect.left, clientY - rect.top)
      const coord = pixelToHex(wx, wy, map.hexSize)
      const key = hexKey(coord.q, coord.r)
      return key in map.hexes ? coord : null
    },
    [map, screenToWorld]
  )

  // ── Mouse events ──────────────────────────────────────────────────────────────

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!map) return
      if (e.button === 1 || activeTool === 'pan') {
        isPanning.current = true
        lastMouse.current = { x: e.clientX, y: e.clientY }
        panAnim.current = null  // cancel any in-flight animation
        return
      }
      if (e.button !== 0) return

      if (activeTool === 'river') {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const [wx, wy] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
        const ek = nearestRiverEdge(wx, wy, map.hexes, map.hexSize)
        if (ek) {
          riverDrawMode.current = (ek in (map.rivers ?? {})) ? 'remove' : 'add'
          lastRiverEdgeRef.current = ek
          isRiverDrawing.current = true
          toggleRiverEdge(ek)
        }
        return
      }
      if (activeTool === 'region') {
        isPainting.current = true
        beginStroke()
        const coord = hexAtScreen(e.clientX, e.clientY)
        if (coord) paintRegionHex(coord.q, coord.r)
        return
      }
      if (activeTool === 'faction') {
        isPainting.current = true
        const coord = hexAtScreen(e.clientX, e.clientY)
        if (coord) paintFactionHex(coord.q, coord.r)
        return
      }
      if (activeTool === 'paint' || activeTool === 'erase') {
        isPainting.current = true
        beginStroke()
        const coord = hexAtScreen(e.clientX, e.clientY)
        if (coord) paintHex(coord.q, coord.r)
      } else if (activeTool === 'climate') {
        isPainting.current = true
        beginStroke()
        const coord = hexAtScreen(e.clientX, e.clientY)
        if (coord) paintClimateHex(coord.q, coord.r)
      } else if (activeTool === 'select') {
        const coord = hexAtScreen(e.clientX, e.clientY)
        const key = coord ? hexKey(coord.q, coord.r) : null
        if (selectModeRef.current === 'faction') {
          const regionId = key && map.hexes[key]?.region ? map.hexes[key].region! : null
          const mapRegionName = regionId ? map.regions[regionId]?.name : null
          const simRegion = simWorldRef.current?.regions.find((region) =>
            region.name === regionId ||
            region.display_name === regionId ||
            region.name === mapRegionName ||
            region.display_name === mapRegionName
          )
          if (simRegion?.owner) setSimDetailSelection({ type: 'faction', factionName: simRegion.owner })
          else setSimDetailSelection(null)
        } else if (selectModeRef.current === 'region') {
          const regionId = key && map.hexes[key]?.region ? map.hexes[key].region! : null
          selectRegion(regionId)
        } else {
          selectHex(key)
        }
        needsRedraw.current = true
      }
    },
    [map, activeTool, beginStroke, hexAtScreen, paintHex, paintRegionHex, paintClimateHex, paintFactionHex, selectHex, selectRegion, setSimDetailSelection, toggleRiverEdge, screenToWorld]
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanning.current) {
        view.current.offsetX += e.clientX - lastMouse.current.x
        view.current.offsetY += e.clientY - lastMouse.current.y
        lastMouse.current = { x: e.clientX, y: e.clientY }
        needsRedraw.current = true
        return
      }
      if (activeTool === 'river') {
        const canvas = canvasRef.current
        if (!canvas || !map) return
        const rect = canvas.getBoundingClientRect()
        const [wx, wy] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
        const ek = nearestRiverEdge(wx, wy, map.hexes, map.hexSize)
        if (ek !== hoverRiverEdge.current) { hoverRiverEdge.current = ek; needsRedraw.current = true }
        if (isRiverDrawing.current && ek && ek !== lastRiverEdgeRef.current) {
          lastRiverEdgeRef.current = ek
          const hasRiver = ek in (map.rivers ?? {})
          if (riverDrawMode.current === 'add' && !hasRiver) toggleRiverEdge(ek)
          if (riverDrawMode.current === 'remove' && hasRiver) toggleRiverEdge(ek)
        }
        return
      }

      const coord = hexAtScreen(e.clientX, e.clientY)
      const prevKey = hoverCoord.current ? hexKey(hoverCoord.current.q, hoverCoord.current.r) : null
      const newKey  = coord ? hexKey(coord.q, coord.r) : null
      if (prevKey !== newKey) { hoverCoord.current = coord; needsRedraw.current = true }

      if (isPainting.current && coord) {
        if (activeTool === 'paint' || activeTool === 'erase') paintHex(coord.q, coord.r)
        if (activeTool === 'region') paintRegionHex(coord.q, coord.r)
        if (activeTool === 'climate') paintClimateHex(coord.q, coord.r)
        if (activeTool === 'faction') paintFactionHex(coord.q, coord.r)
      }
    },
    [activeTool, map, hexAtScreen, paintHex, paintRegionHex, paintClimateHex, paintFactionHex, toggleRiverEdge, screenToWorld]
  )

  const onMouseUp = useCallback(() => {
    if (isPainting.current) endStroke()
    isPainting.current = false
    isPanning.current = false
    isRiverDrawing.current = false
    lastRiverEdgeRef.current = null
  }, [endStroke])

  const onMouseLeave = useCallback(() => {
    if (isPainting.current) endStroke()
    isPainting.current = false
    isPanning.current = false
    isRiverDrawing.current = false
    lastRiverEdgeRef.current = null
    if (hoverCoord.current !== null || hoverRiverEdge.current !== null) {
      hoverCoord.current = null
      hoverRiverEdge.current = null
      needsRedraw.current = true
    }
  }, [endStroke])

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.current.zoom * factor))
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    view.current.offsetX = mx - (mx - view.current.offsetX) * (newZoom / view.current.zoom)
    view.current.offsetY = my - (my - view.current.offsetY) * (newZoom / view.current.zoom)
    view.current.zoom = newZoom
    needsRedraw.current = true
  }, [])

  const cursor =
    activeTool === 'pan'    ? 'grab' :
    activeTool === 'select' ? 'crosshair' :
    activeTool === 'river'  ? 'crosshair' :
    'cell'

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ cursor, background: '#0d1117' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
    />
  )
}

// ── Drawing helpers ────────────────────────────────────────────────────────────

function drawHexFill(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  const corners = hexCorners(cx, cy, size)
  ctx.beginPath()
  ctx.moveTo(corners[0][0], corners[0][1])
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1])
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function drawRegionLabels(
  ctx: CanvasRenderingContext2D,
  hexes: Record<string, HexData>,
  regions: Record<string, RegionData>,
  hexSize: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
  canvasWidth: number,
  canvasHeight: number,
  viewL: number,
  viewT: number,
  viewR: number,
  viewB: number,
  cullPad: number,
) {
  if (zoom < REGION_LABEL_MIN_ZOOM) return
  if (canvasWidth <= 0 || canvasHeight <= 0) return

  const visibleSums: Record<string, { x: number; y: number; n: number }> = {}
  for (const hex of Object.values(hexes)) {
    if (!hex.region || !regions[hex.region]) continue
    const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
    if (cx + cullPad < viewL || cx - cullPad > viewR) continue
    if (cy + cullPad < viewT || cy - cullPad > viewB) continue
    const sum = visibleSums[hex.region] ?? (visibleSums[hex.region] = { x: 0, y: 0, n: 0 })
    sum.x += cx
    sum.y += cy
    sum.n += 1
  }

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = Math.min(1, (zoom - REGION_LABEL_MIN_ZOOM) / REGION_LABEL_FADE_ZOOM_RANGE)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fontSize = zoom > 0.7 ? 14 : zoom > 0.28 ? 13 : 12
  const lineHeight = fontSize + 3
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(2,6,12,0.96)'
  ctx.lineWidth = 4.4
  ctx.fillStyle = 'rgba(255,255,255,0.98)'
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 2

  const pad = 34
  for (const [id, { x, y, n }] of Object.entries(visibleSums)) {
    if (n === 0) continue
    const rd = regions[id]
    const rawX = (x / n) * zoom + offsetX
    const rawY = (y / n) * zoom + offsetY
    const sx = Math.min(Math.max(rawX, pad), Math.max(pad, canvasWidth - pad))
    const sy = Math.min(Math.max(rawY, pad), Math.max(pad, canvasHeight - pad))
    const lines = splitRegionLabel(rd.name)
    const y0 = sy - ((lines.length - 1) * lineHeight) / 2
    for (let i = 0; i < lines.length; i += 1) {
      const lineY = y0 + i * lineHeight
      ctx.strokeText(lines[i], sx, lineY)
      ctx.fillText(lines[i], sx, lineY)
    }
  }
  ctx.restore()
}

function splitRegionLabel(label: string): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (label.length <= 18 || words.length < 2) return [label]

  let bestIndex = 1
  let bestScore = Number.POSITIVE_INFINITY
  for (let i = 1; i < words.length; i += 1) {
    const left = words.slice(0, i).join(' ')
    const right = words.slice(i).join(' ')
    const score = Math.abs(left.length - right.length) + Math.max(left.length, right.length) * 0.15
    if (score < bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return [
    words.slice(0, bestIndex).join(' '),
    words.slice(bestIndex).join(' '),
  ]
}

function strokeHex(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const corners = hexCorners(cx, cy, size)
  ctx.beginPath()
  ctx.moveTo(corners[0][0], corners[0][1])
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1])
  ctx.closePath()
  ctx.stroke()
}

function drawSettlement(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  hex: HexData, hexSize: number, zoom: number,
) {
  const r = SETTLEMENT_DOT_RADIUS[hex.settlementSize ?? 'village']
  ctx.beginPath()
  ctx.arc(cx, cy, r / zoom < 1.5 ? 1.5 / zoom : r, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 0.8 / zoom
  ctx.stroke()
  if (zoom > 0.5 && hex.settlement) {
    const fontSize = Math.max(9, hexSize * 0.45)
    ctx.font = `${fontSize}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2.5 / zoom
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.strokeText(hex.settlement, cx, cy + r + 2)
    ctx.fillText(hex.settlement, cx, cy + r + 2)
  }
}

// ── River helpers ──────────────────────────────────────────────────────────────

function riverLineWidth(size: RiverSize, hexSize: number, zoom: number): number {
  const factor = size === 'small' ? 0.10 : size === 'large' ? 0.28 : 0.18
  const minPx  = size === 'small' ? 1.0  : size === 'large' ? 2.5  : 1.5
  return Math.max(minPx, hexSize * factor) / zoom
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy)
}

function nearestRiverEdge(
  wx: number, wy: number,
  hexes: Record<string, import('../types/map').HexData>,
  hexSize: number,
): string | null {
  const center = pixelToHex(wx, wy, hexSize)
  const candidates = [center, ...HEX_NEIGHBORS.map(n => ({ q: center.q + n.q, r: center.r + n.r }))]
  let bestDist = hexSize * 0.8
  let bestKey: string | null = null
  for (const hex of candidates) {
    if (!(hexKey(hex.q, hex.r) in hexes)) continue
    const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
    const corners = hexCorners(cx, cy, hexSize)
    for (let d = 0; d < 6; d++) {
      const nq = hex.q + HEX_NEIGHBORS[d].q
      const nr = hex.r + HEX_NEIGHBORS[d].r
      if (!(hexKey(nq, nr) in hexes)) continue
      const slot = NEIGHBOR_TO_EDGE_SLOT[d]
      const [x1, y1] = corners[slot]
      const [x2, y2] = corners[(slot + 1) % 6]
      const dist = distToSegment(wx, wy, x1, y1, x2, y2)
      if (dist < bestDist) { bestDist = dist; bestKey = riverEdgeKey(hex.q, hex.r, nq, nr) }
    }
  }
  return bestKey
}
