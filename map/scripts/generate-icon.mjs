/**
 * Generates resources/icon.png — 256×256 RGBA, transparent background.
 * Uses only Node.js built-ins (fs, zlib). No npm dependencies.
 *
 * Design: perfect equilateral triangle (circumradius 90, centred at 128,128)
 * with node circles at each vertex and a globe (C-arc + equator + meridian
 * + continent blob) centred inside.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { deflateSync } from 'zlib'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT  = join(ROOT, 'resources', 'icon.png')

// ── Canvas ────────────────────────────────────────────────────────────────────

const SIZE = 256
const px = new Uint8ClampedArray(SIZE * SIZE * 4)   // RGBA, fully transparent

const [IR, IG, IB] = [129, 140, 248]   // indigo-400 #818cf8

function plot(x, y, alpha) {
  const xi = x|0, yi = y|0
  if (xi < 0 || xi >= SIZE || yi < 0 || yi >= SIZE || alpha <= 0) return
  const i = (yi * SIZE + xi) * 4
  const sa = alpha / 255, da = px[i+3] / 255
  const oa = sa + da * (1 - sa)
  if (oa < 1/255) return
  px[i]   = ((IR*sa + px[i]  *da*(1-sa)) / oa + .5)|0
  px[i+1] = ((IG*sa + px[i+1]*da*(1-sa)) / oa + .5)|0
  px[i+2] = ((IB*sa + px[i+2]*da*(1-sa)) / oa + .5)|0
  px[i+3] = (oa * 255 + .5)|0
}

// ── Anti-aliasing helpers ─────────────────────────────────────────────────────

/** 255→0 transition over 1.4px centred at exactly halfWidth from the edge */
function aa(dist, halfWidth) {
  if (dist <= halfWidth - 0.7) return 255
  if (dist >= halfWidth + 0.7) return 0
  return ((halfWidth + 0.7 - dist) / 1.4 * 255 + .5)|0
}

/**
 * Iterate every pixel in a bounding box, call distFn, plot with aa.
 * For filled shapes pass sw=-1 and distFn returning signed distance
 * (negative = inside), then call with fill=true.
 */
function scanStroke(x0, y0, x1, y1, sw, distFn) {
  const hw = sw / 2
  const lx = Math.max(0, (x0 - hw - 1.5)|0)
  const rx = Math.min(SIZE - 1, Math.ceil(x1 + hw + 1.5))
  const ly = Math.max(0, (y0 - hw - 1.5)|0)
  const ry = Math.min(SIZE - 1, Math.ceil(y1 + hw + 1.5))
  for (let y = ly; y <= ry; y++)
    for (let x = lx; x <= rx; x++) {
      const a = aa(distFn(x + .5, y + .5), hw)
      if (a > 0) plot(x, y, a)
    }
}

function scanFill(cx, cy, rx_, ry_, maxAlpha, pixDistFn) {
  const lx = Math.max(0, (cx - rx_ - 2)|0)
  const tx = Math.min(SIZE - 1, Math.ceil(cx + rx_ + 2))
  const ly = Math.max(0, (cy - ry_ - 2)|0)
  const ty = Math.min(SIZE - 1, Math.ceil(cy + ry_ + 2))
  for (let y = ly; y <= ty; y++)
    for (let x = lx; x <= tx; x++) {
      const d = pixDistFn(x + .5, y + .5) // negative = inside
      const a = d <= -0.7 ? maxAlpha
              : d >=  0.7 ? 0
              : ((0.7 - d) / 1.4 * maxAlpha + .5)|0
      if (a > 0) plot(x, y, a)
    }
}

// ── Distance functions ────────────────────────────────────────────────────────

function dSeg(px_, py_, ax, ay, bx, by) {
  const dx = bx-ax, dy = by-ay, sq = dx*dx+dy*dy
  if (sq < 1e-9) return Math.hypot(px_-ax, py_-ay)
  const t = Math.max(0, Math.min(1, ((px_-ax)*dx+(py_-ay)*dy)/sq))
  return Math.hypot(px_-(ax+t*dx), py_-(ay+t*dy))
}

/** C-arc: full circle minus a gap of ±GAP_HALF radians around the east axis */
const GAP_HALF = Math.PI / 4   // 45°

function dCArc(px_, py_, cx, cy, r) {
  const dx = px_-cx, dy = py_-cy
  const theta = Math.atan2(dy, dx)
  if (Math.abs(theta) >= GAP_HALF) {
    // In the arc region — perpendicular to the circle
    return Math.abs(Math.hypot(dx, dy) - r)
  }
  // In the gap — distance to nearest arc endpoint
  const ex = r * Math.cos(GAP_HALF)
  const ey = r * Math.sin(GAP_HALF)
  return Math.min(
    Math.hypot(dx - ex, dy + ey),   // lower-right endpoint (angle +GAP_HALF)
    Math.hypot(dx - ex, dy - ey),   // upper-right endpoint (angle -GAP_HALF)
  )
}

/** Quadratic bezier distance by uniform sampling */
function dBezier(px_, py_, x0, y0, qx, qy, x1, y1, n = 256) {
  let best = Infinity
  for (let k = 0; k <= n; k++) {
    const t = k/n, mt = 1-t
    const bx = mt*mt*x0 + 2*mt*t*qx + t*t*x1
    const by = mt*mt*y0 + 2*mt*t*qy + t*t*y1
    const d  = Math.hypot(px_-bx, py_-by)
    if (d < best) best = d
  }
  return best
}

// ── Icon geometry ─────────────────────────────────────────────────────────────

const SIN60 = Math.sqrt(3) / 2    // 0.866025…
const RCIRC = 90                  // circumradius of triangle

// Perfect equilateral triangle, centred at (128,128), apex pointing up
const TOPx = 128,            TOPy = 128 - RCIRC               // (128,  38)
const BLx  = 128 - RCIRC*SIN60, BLy  = 128 + RCIRC*0.5       // (50.1, 173)
const BRx  = 128 + RCIRC*SIN60, BRy  = BLy                    // (205.9,173)

const NODE_R  = 11    // node circle radius (px)
const NODE_SW = 5.5   // node circle stroke width
const LINE_SW = 6.5   // triangle side stroke width

// Unit vectors along each triangle side
const dABx = BLx-TOPx, dABy = BLy-TOPy, dAB = Math.hypot(dABx,dABy)
const uABx = dABx/dAB, uABy = dABy/dAB

const dACx = BRx-TOPx, dACy = BRy-TOPy, dAC = Math.hypot(dACx,dACy)
const uACx = dACx/dAC, uACy = dACy/dAC

// Line endpoints — from node edge to node edge
const L1 = [TOPx+NODE_R*uABx, TOPy+NODE_R*uABy,  BLx-NODE_R*uABx, BLy-NODE_R*uABy]
const L2 = [TOPx+NODE_R*uACx, TOPy+NODE_R*uACy,  BRx-NODE_R*uACx, BRy-NODE_R*uACy]
const L3 = [BLx+NODE_R,       BLy,               BRx-NODE_R,       BRy]

// Globe
const GCX = 128, GCY = 128, GR = 38
const GLOBE_SW = 5.5, EQ_SW = 4, MER_SW = 4

// Equator: from left edge of globe to right opening of C-arc
const EQx1 = GCX - GR
const EQx2 = GCX + GR * Math.cos(GAP_HALF)   // ~154.9
const EQy  = GCY

// Meridian: from globe top to globe bottom, control bowed 22px left
const Mx0 = GCX, My0 = GCY - GR      // (128, 90)
const Mqx = GCX - 22, Mqy = GCY      // (106, 128)
const Mx1 = GCX, My1 = GCY + GR      // (128, 166)

// Continent blob — small filled ellipse, upper-left of globe centre
const CONTcx = 112, CONTcy = 120, CONTrx = 17, CONTry = 12

// ── Draw ──────────────────────────────────────────────────────────────────────

// 1. Triangle sides
drawLine(L1); drawLine(L2); drawLine(L3)

function drawLine([ax, ay, bx, by]) {
  scanStroke(Math.min(ax,bx), Math.min(ay,by),
             Math.max(ax,bx), Math.max(ay,by), LINE_SW,
    (x, y) => dSeg(x, y, ax, ay, bx, by))
}

// 2. Continent blob (drawn before globe lines so lines appear in front)
scanFill(CONTcx, CONTcy, CONTrx, CONTry, 155,
  (x, y) => (Math.hypot((x-CONTcx)/CONTrx, (y-CONTcy)/CONTry) - 1) * Math.min(CONTrx, CONTry)
)

// 3. Globe C-arc
scanStroke(GCX-GR-GLOBE_SW, GCY-GR-GLOBE_SW,
           GCX+GR+GLOBE_SW, GCY+GR+GLOBE_SW, GLOBE_SW,
  (x, y) => dCArc(x, y, GCX, GCY, GR))

// 4. Globe equator
scanStroke(EQx1, EQy, EQx2, EQy, EQ_SW,
  (x, y) => dSeg(x, y, EQx1, EQy, EQx2, EQy))

// 5. Globe meridian
scanStroke(Math.min(Mx0,Mqx), Math.min(My0,Mqy),
           Math.max(Mx1,Mqx), Math.max(My1,Mqy), MER_SW,
  (x, y) => dBezier(x, y, Mx0, My0, Mqx, Mqy, Mx1, My1))

// 6. Node circles (drawn last — on top of line endpoints)
for (const [cx, cy] of [[TOPx,TOPy],[BLx,BLy],[BRx,BRy]]) {
  scanStroke(cx-NODE_R-NODE_SW, cy-NODE_R-NODE_SW,
             cx+NODE_R+NODE_SW, cy+NODE_R+NODE_SW, NODE_SW,
    (x, y) => Math.abs(Math.hypot(x-cx, y-cy) - NODE_R))
}

// ── PNG encoding (no external deps) ──────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(data) {
  let c = 0xFFFFFFFF
  for (let b of data) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const typeB = Buffer.from(type)
  const lenB  = Buffer.allocUnsafe(4); lenB.writeUInt32BE(data.length)
  const crcB  = Buffer.allocUnsafe(4); crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])))
  return Buffer.concat([lenB, typeB, data, crcB])
}

// Raw scanline data: filter=0 (None) + RGBA per row
const raw = Buffer.allocUnsafe(SIZE * (1 + SIZE * 4))
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE*4)] = 0
  for (let x = 0; x < SIZE; x++) {
    const si = (y*SIZE + x) * 4
    const di = y*(1+SIZE*4) + 1 + x*4
    raw[di]   = px[si]
    raw[di+1] = px[si+1]
    raw[di+2] = px[si+2]
    raw[di+3] = px[si+3]
  }
}

const ihdr = Buffer.allocUnsafe(13)
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0  // 8-bit RGBA

const png = Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),   // PNG signature
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', deflateSync(raw, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0)),
])

if (!existsSync(join(ROOT, 'resources'))) mkdirSync(join(ROOT, 'resources'), { recursive: true })
writeFileSync(OUT, png)
console.log(`✓  ${SIZE}×${SIZE} icon written → ${OUT}`)
