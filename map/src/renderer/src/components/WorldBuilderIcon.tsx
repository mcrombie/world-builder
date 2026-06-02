/**
 * World Builder logo SVG — perfectly symmetrical.
 *
 * Geometry (100×100 viewBox, matches generate-icon.mjs scaled by 100/256):
 *   Triangle circumradius R=35.16 (=90/256*100), centred at (50,50)
 *   Vertices:  TOP=(50,15.2)  BL=(19.6,67.6)  BR=(80.4,67.6)
 *   Node circles: r=4.3 (=11/256*100)
 *   Globe: cx=50 cy=50 r=14.8 (=38/256*100), C-arc gap ±45°
 *   Equator: y=50, from x=35.2 to x=60.5
 *   Meridian: bezier (50,35.2) ctrl(41.4,50) (50,64.8)
 *   Continent: ellipse cx=43.75 cy=46.9 rx=6.6 ry=4.7
 */
export function WorldBuilderIcon({
  size      = 24,
  className = '',
}: {
  size?:      number
  className?: string
}) {
  // All values derived from the same geometry as generate-icon.mjs (256→100 scale)
  const s = 100 / 256   // scale factor

  // Triangle
  const R = 90 * s                           // circumradius = 35.156
  const cx = 50, cy = 50                     // centre
  const sin60 = Math.sqrt(3) / 2
  const TOPx = cx,               TOPy = cy - R                  // (50,   14.84)
  const BLx  = cx - R * sin60,   BLy  = cy + R * 0.5            // (19.6, 67.58)
  const BRx  = cx + R * sin60,   BRy  = BLy                     // (80.4, 67.58)

  const NR = 11 * s                          // node radius = 4.30
  const gapHalf = Math.PI / 4               // 45° gap in C-arc
  const GR = 38 * s                          // globe radius = 14.84

  // Line unit vectors
  const dABx = BLx-TOPx, dABy = BLy-TOPy, dAB = Math.hypot(dABx,dABy)
  const uABx = dABx/dAB, uABy = dABy/dAB
  const uACx = (BRx-TOPx)/dAB, uACy = (BRy-TOPy)/dAB

  // Line endpoints (circle-edge to circle-edge)
  const L1 = `M${f(TOPx+NR*uABx)},${f(TOPy+NR*uABy)} L${f(BLx-NR*uABx)},${f(BLy-NR*uABy)}`
  const L2 = `M${f(TOPx+NR*uACx)},${f(TOPy+NR*uACy)} L${f(BRx-NR*uACx)},${f(BRy-NR*uACy)}`
  const L3 = `M${f(BLx+NR)},${f(BLy)} L${f(BRx-NR)},${f(BRy)}`

  // Globe C-arc: from upper-right opening to lower-right opening, going left
  const ex = cx + GR * Math.cos(gapHalf)
  const ey = GR * Math.sin(gapHalf)
  const arcStart = `${f(ex)},${f(cy - ey)}`  // upper-right endpoint
  const arcEnd   = `${f(ex)},${f(cy + ey)}`  // lower-right endpoint
  const arc = `M${arcStart} A${f(GR)},${f(GR)} 0 1,0 ${arcEnd}`

  // Equator
  const EQx1 = f(cx - GR), EQx2 = f(ex), EQy = f(cy)
  const equator = `M${EQx1},${EQy} L${EQx2},${EQy}`

  // Meridian bezier
  const meridian = `M${f(cx)},${f(cy-GR)} Q${f(cx-8.6*s*256/100)},${f(cy)} ${f(cx)},${f(cy+GR)}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Triangle sides */}
      <path strokeWidth="2.55" d={L1} />
      <path strokeWidth="2.55" d={L2} />
      <path strokeWidth="2.55" d={L3} />

      {/* Continent blob — behind globe lines */}
      <ellipse
        cx={f(43.75)} cy={f(46.88)}
        rx={f(6.64)}  ry={f(4.69)}
        fill="currentColor" fillOpacity="0.6" stroke="none"
      />

      {/* Globe C-arc */}
      <path strokeWidth="2.15" d={arc} />

      {/* Globe equator */}
      <path strokeWidth="1.56" d={equator} />

      {/* Globe meridian */}
      <path strokeWidth="1.56" d={meridian} />

      {/* Node circles — drawn last, on top of line endpoints */}
      <circle strokeWidth="2.15" cx={f(TOPx)} cy={f(TOPy)} r={f(NR)} />
      <circle strokeWidth="2.15" cx={f(BLx)}  cy={f(BLy)}  r={f(NR)} />
      <circle strokeWidth="2.15" cx={f(BRx)}  cy={f(BRy)}  r={f(NR)} />
    </svg>
  )
}

function f(n: number): string {
  return (Math.round(n * 100) / 100).toString()
}
