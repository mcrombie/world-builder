import { useRef, useEffect, useCallback } from 'react'
import { useMapStore } from '../store/mapStore'
import {
  hexToPixel, pixelToHex, hexCorners, hexKey, hexesInRadius, AxialCoord,
  riverEdgeKey, parseRiverEdge, NEIGHBOR_TO_EDGE_SLOT, HEX_NEIGHBORS,
} from '../lib/hex'
import { TERRAIN_COLORS } from '../lib/terrain'
import { HexData, RiverSize, SimWorldState } from '../types/map'
import { SelectMode } from '../types/map'
import { buildFactionColorMap } from './SimulationPanel'

interface ViewState {
  offsetX: number
  offsetY: number
  zoom: number
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
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

  const map             = useMapStore((s) => s.map)
  const mapVersion      = useMapStore((s) => s.mapVersion)
  const mapRef          = useRef(map)
  const layers          = useMapStore((s) => s.layers)
  const selectedHex     = useMapStore((s) => s.selectedHex)
  const selectedRegion  = useMapStore((s) => s.selectedRegion)
  const selectMode      = useMapStore((s) => s.selectMode)
  const activeTool      = useMapStore((s) => s.activeTool)
  const brushRadius     = useMapStore((s) => s.brushRadius)
  const activeRegion    = useMapStore((s) => s.activeRegion)
  const beginStroke     = useMapStore((s) => s.beginStroke)
  const paintHex        = useMapStore((s) => s.paintHex)
  const paintRegionHex  = useMapStore((s) => s.paintRegionHex)
  const endStroke       = useMapStore((s) => s.endStroke)
  const selectHex       = useMapStore((s) => s.selectHex)
  const selectRegion    = useMapStore((s) => s.selectRegion)
  const toggleRiverEdge = useMapStore((s) => s.toggleRiverEdge)
  const simWorld        = useMapStore((s) => s.simWorld)
  const isSimulating    = useMapStore((s) => s.isSimulating)
  const simWorldRef     = useRef<SimWorldState | null>(simWorld)
  const isSimRef        = useRef(isSimulating)
  simWorldRef.current   = simWorld
  isSimRef.current      = isSimulating

  const hoverCoord        = useRef<AxialCoord | null>(null)
  const hoverRiverEdge    = useRef<string | null>(null)
  const isRiverDrawing    = useRef(false)
  const riverDrawMode     = useRef<'add' | 'remove'>('add')
  const lastRiverEdgeRef  = useRef<string | null>(null)
  const activeToolRef     = useRef(activeTool)
  const brushRadiusRef    = useRef(brushRadius)
  const activeRegionRef   = useRef(activeRegion)
  const selectModeRef     = useRef(selectMode)
  activeToolRef.current   = activeTool
  brushRadiusRef.current  = brushRadius
  activeRegionRef.current = activeRegion
  selectModeRef.current   = selectMode
  mapRef.current          = map

  useEffect(() => {
    if (!map?.underlayPath) { underlayImg.current = null; needsRedraw.current = true; return }
    const img = new Image()
    img.onload = () => { underlayImg.current = img; needsRedraw.current = true }
    img.src = map.underlayPath
  }, [map?.underlayPath])

  useEffect(() => { needsRedraw.current = true }, [map, layers, selectedHex, selectedRegion, brushRadius, activeTool, activeRegion, simWorld, isSimulating])

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

    // ── Simulation faction overlay + territory labels ─────────────────────────
    if (isSimRef.current && simWorldRef.current) {
      const factionColors = buildFactionColorMap(simWorldRef.current.factions)
      const factionLabels: Record<string, string> = {}
      for (const f of simWorldRef.current.factions) {
        factionLabels[f.name] = f.display_name.split(' ')[0]
      }
      const regionOwnerMap: Record<string, string | null> = {}
      for (const r of simWorldRef.current.regions) {
        regionOwnerMap[r.name] = r.owner
      }

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

      // Territory name labels — drawn in screen space so size is always readable
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)   // identity: switch to screen pixels
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3.5
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
    }

    // ── Region fill + borders ─────────────────────────────────────────────────
    if (layers.regions) {
      // Translucent fill per region
      ctx.globalAlpha = 0.22
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
      for (const hex of Object.values(hexes)) {
        if (!hex.region) continue
        const rd = regions[hex.region]
        if (!rd) continue
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        const corners = hexCorners(cx, cy, hexSize)
        ctx.strokeStyle = rd.color
        ctx.lineWidth = Math.max(1.5, hexSize * 0.12) / zoom
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

      // Region name labels at centroid of each region's hex cluster
      if (zoom > 0.25) {
        const sums: Record<string, { x: number; y: number; n: number }> = {}
        for (const hex of Object.values(hexes)) {
          if (!hex.region || !regions[hex.region]) continue
          const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
          if (!sums[hex.region]) sums[hex.region] = { x: 0, y: 0, n: 0 }
          sums[hex.region].x += cx
          sums[hex.region].y += cy
          sums[hex.region].n++
        }
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const fontSize = Math.max(9, hexSize * 0.55)
        ctx.font = `italic bold ${fontSize}px serif`
        for (const [id, { x, y, n }] of Object.entries(sums)) {
          if (n === 0) continue
          const lx = x / n, ly = y / n
          if (lx + cullPad < viewL || lx - cullPad > viewR) continue
          if (ly + cullPad < viewT || ly - cullPad > viewB) continue
          const rd = regions[id]
          ctx.strokeStyle = 'rgba(0,0,0,0.7)'
          ctx.lineWidth = 3 / zoom
          ctx.strokeText(rd.name, lx, ly)
          ctx.fillStyle = rd.color
          ctx.fillText(rd.name, lx, ly)
        }
      }
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
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2 / zoom
      strokeHex(ctx, cx, cy, hexSize)
      ctx.strokeStyle = '#ffcc00'
      ctx.lineWidth = 1 / zoom
      strokeHex(ctx, cx, cy, hexSize * 0.85)
    }

    // ── Selected region highlight ─────────────────────────────────────────────
    if (selectedRegion) {
      ctx.strokeStyle = '#ffcc00'
      ctx.lineWidth = 2 / zoom
      for (const hex of Object.values(hexes)) {
        if (hex.region !== selectedRegion) continue
        const [cx, cy] = hexToPixel(hex.q, hex.r, hexSize)
        if (cx + cullPad < viewL || cx - cullPad > viewR) continue
        if (cy + cullPad < viewT || cy - cullPad > viewB) continue
        strokeHex(ctx, cx, cy, hexSize)
      }
    }

    // ── Brush / region-paint hover preview ────────────────────────────────────
    const tool = activeToolRef.current
    const hc   = hoverCoord.current
    if (hc && (tool === 'paint' || tool === 'erase' || tool === 'region')) {
      const radius = brushRadiusRef.current
      const previewColor =
        tool === 'erase'  ? '#ff6666' :
        tool === 'region' ? (activeRegionRef.current ? (map.regions[activeRegionRef.current]?.color ?? '#ffffff') : '#ff6666') :
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

    ctx.restore()
  }, [map, layers, selectedHex, selectedRegion, activeRegion])

  // ── RAF loop ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => {
      if (needsRedraw.current) { render(); needsRedraw.current = false }
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
      if (activeTool === 'paint' || activeTool === 'erase') {
        isPainting.current = true
        beginStroke()
        const coord = hexAtScreen(e.clientX, e.clientY)
        if (coord) paintHex(coord.q, coord.r)
      } else if (activeTool === 'select') {
        const coord = hexAtScreen(e.clientX, e.clientY)
        if (selectModeRef.current === 'region') {
          const key = coord ? hexKey(coord.q, coord.r) : null
          const regionId = key && map.hexes[key]?.region ? map.hexes[key].region! : null
          selectRegion(regionId)
        } else {
          selectHex(coord ? hexKey(coord.q, coord.r) : null)
        }
        needsRedraw.current = true
      }
    },
    [map, activeTool, beginStroke, hexAtScreen, paintHex, paintRegionHex, selectHex, selectRegion, toggleRiverEdge, screenToWorld]
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
      }
    },
    [activeTool, map, hexAtScreen, paintHex, paintRegionHex, toggleRiverEdge, screenToWorld]
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
