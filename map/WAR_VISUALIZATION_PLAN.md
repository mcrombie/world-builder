# War Visualization: Battle Site Markers + War Layer

Two sim-mode overlays drawn on `HexCanvas`. Neither touches the map data model — they are pure rendering additions keyed off `simWorld.active_wars`.

---

## Overview

| Feature | What it looks like | When visible |
|---|---|---|
| **War Layer** | Semi-transparent red tint + pulsing border on contested regions | `layers.wars === true` while simulating |
| **Battle Site Markers** | Coloured circle marker at each war's target region centroid, with faction labels at close zoom | Always on while simulating (no separate toggle needed) |

---

## Step 1 — Extend `LayerVisibility`

**File:** `src/renderer/src/types/map.ts`

Add `wars` to the `LayerVisibility` interface:

```ts
export interface LayerVisibility {
  terrain: boolean
  grid: boolean
  regions: boolean
  factions: boolean
  settlements: boolean
  rivers: boolean
  underlay: boolean
  climate: boolean
  wars: boolean          // ← new
}
```

**File:** `src/renderer/src/store/mapStore.ts`

Add the default in the initial `layers` object:

```ts
layers: {
  terrain: true,
  grid: true,
  regions: true,
  factions: false,
  settlements: true,
  rivers: true,
  underlay: false,
  climate: true,
  wars: true,           // ← new, on by default when sim is active
},
```

---

## Step 2 — Toolbar Toggle

**File:** `src/renderer/src/components/Toolbar.tsx`

Add a "Wars" toggle button that is only rendered when `isSimulating` is true (same pattern as any sim-specific toolbar control). It calls `setLayer('wars', !layers.wars)`.

---

## Step 3 — RAF Loop: Continuous Redraw for Pulsing

**File:** `src/renderer/src/components/HexCanvas.tsx`

The war layer uses a time-based pulse, so the canvas must redraw every frame while wars are active. In the existing RAF loop:

```ts
const loop = () => {
  // existing smooth-pan animation block …

  // Force continuous redraw when the war pulse is active
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
```

`layers` is already subscribed via `useMapStore` and captured in the `render` callback's closure, so no extra ref is needed.

---

## Step 4 — War Layer (HexCanvas render function)

Insert this pass **after** the sim faction overlay block (after line ~260, before the region fill block).

### 4a — Build war data structures

```ts
// Inside the `isSimRef.current && simWorldRef.current` block, after regionOwnerMap is built:

const warTargetSet = new Set<string>()                      // sim region names under attack
const warAggressorMap: Record<string, string> = {}          // region name → aggressor faction name

for (const war of simWorldRef.current.active_wars ?? []) {
  if (!war.target_region) continue
  warTargetSet.add(war.target_region)
  warAggressorMap[war.target_region] = war.aggressor
}
```

### 4b — Tinted fill on contested hexes

```ts
if (layers.wars && warTargetSet.size > 0) {
  const t = performance.now() / 1000
  // Pulse between 0.18 and 0.38 alpha over a 1.4s cycle
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
```

### 4c — Border around contested region perimeter

Same edge-walking logic as the existing region/faction border passes — draw an edge only where the neighbor is NOT in the same contested region:

```ts
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
} // end layers.wars block
```

---

## Step 5 — Battle Site Markers (HexCanvas render function)

Insert this pass **after** the war layer block, still inside `isSimRef.current && simWorldRef.current`. Markers are drawn regardless of `layers.wars` (they're lightweight and always useful during simulation).

### 5a — Compute region centroids in world space

```ts
// Build centroid for each war target region
const warCentroids: Array<{
  war: SimActiveWar
  cx: number
  cy: number
}> = []

for (const war of simWorldRef.current.active_wars ?? []) {
  if (!war.target_region) continue
  let sumX = 0, sumY = 0, count = 0
  for (const hex of Object.values(hexes)) {
    if (hex.region !== war.target_region) continue
    const [hx, hy] = hexToPixel(hex.q, hex.r, hexSize)
    sumX += hx; sumY += hy; count++
  }
  if (count === 0) continue
  warCentroids.push({ war, cx: sumX / count, cy: sumY / count })
}
```

### 5b — Draw markers in screen space

Switch to identity transform (screen pixels) exactly as the faction labels do:

```ts
if (warCentroids.length > 0) {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  for (const { war, cx: worldX, cy: worldY } of warCentroids) {
    // World → screen
    const sx = worldX * zoom + offsetX
    const sy = worldY * zoom + offsetY
    if (sx < -30 || sx > canvas.width + 30) continue
    if (sy < -30 || sy > canvas.height + 30) continue

    const aggressorColor = factionColors[war.aggressor] ?? '#ff4444'
    const defenderColor  = factionColors[war.defender]  ?? '#888888'
    const markerR = 10

    // Outer ring (defender colour)
    ctx.beginPath()
    ctx.arc(sx, sy, markerR + 3, 0, Math.PI * 2)
    ctx.strokeStyle = defenderColor
    ctx.lineWidth = 2.5
    ctx.stroke()

    // Filled disc (aggressor colour)
    ctx.beginPath()
    ctx.arc(sx, sy, markerR, 0, Math.PI * 2)
    ctx.fillStyle = aggressorColor
    ctx.fill()

    // White stroke to separate from map
    ctx.beginPath()
    ctx.arc(sx, sy, markerR, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Label: aggressor vs defender (only when zoomed in enough to read it)
    if (zoom > 0.55) {
      const label = `${factionDisplayMap[war.aggressor] ?? war.aggressor} → ${factionDisplayMap[war.defender] ?? war.defender}`
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
```

Note: `factionDisplayMap` is already built in the sim overlay block (it maps `f.name → f.display_name`). The battle site marker pass just reuses it.

---

## Step 6 — SimulationPanel: Clickable War Rows

**File:** `src/renderer/src/components/SimulationPanel.tsx`

The "Under The Hood" war rows currently show aggressor vs defender as plain text. Make each row clickable and call `setSimDetailSelection({ type: 'region', regionName: war.target_region })` (same API used by the pressure region rows). This pans the map to the contested region and highlights it.

Change the wrapping `<div>` to a `<button>` with the same styling pattern as the hot-region buttons.

---

## Rendering Order Summary

The final draw order in `render()` becomes:

1. Underlay image
2. Terrain fill
3. Climate fill
4. **Sim faction overlay** (fill + selected-faction highlight + borders + labels) ← existing
5. **War layer** — contested region tint + perimeter border ← new (Step 4)
6. **Battle site markers** ← new (Step 5)
7. Region fill + borders + labels
8. Manual faction overlay (non-sim)
9. Grid lines
10. Settlements
11. Rivers + river hover
12. Selected hex / region highlights
13. Brush hover preview

---

## What Is Not In Scope

- War arrows (aggressor capital → target): too cluttered when multiple wars overlap.
- Panning to the marker on click (the SimulationPanel region click in Step 6 already handles this).
- Any changes to the Python sim backend.
- Any changes to `MapData` — this is entirely a rendering concern.
