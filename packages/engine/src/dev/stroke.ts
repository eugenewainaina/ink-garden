import type { Point } from './leaf.ts'

/**
 * The brush.
 *
 * A stroke is not a line of constant width. `nonflowers` draws every mark as a
 * FILLED POLYGON: take a centreline, offset it by a varying half-width on each
 * side, close the two sides together. Canvas cannot vary a stroke's width along
 * its length, and varying width is most of what makes a mark read as a brush
 * rather than as a plot.
 *
 * The taper below is the reference's, and it is one line because that is all it
 * takes: zero at both ends, widest in the middle, which is a brush loading and
 * lifting.
 */

/** How wide a brush is at a fraction along its stroke. */
export type Taper = (t: number) => number

/** A brush load and lift: nothing at either end, widest in the middle. */
export const BRUSH_TAPER: Taper = (t) => Math.sin(Math.PI * Math.max(0, Math.min(1, t)))

/**
 * A stroke that starts at its full width and runs to a point.
 *
 * This is the taper a vein has. It leaves the midrib at its widest and narrows
 * to nothing at the margin, and it is also how a brush behaves when the hand
 * does not lift: full pressure, then a lift at the end.
 */
export const POINTED_TAPER: Taper = (t) => 1 - Math.max(0, Math.min(1, t)) ** 0.85

/**
 * Turn a centreline into a closed polygon of varying width.
 *
 * The normal at each interior point is the bisector of the two directions
 * leading into and out of it, which is what keeps the offset sides parallel
 * through a bend instead of pinching on the inside of it.
 */
export function taperedStroke(
  centreline: readonly Point[],
  widthAt: Taper,
  halfWidth: number,
): readonly Point[] {
  const points = centreline.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  )
  const count = points.length
  // Phrased as a positive test rather than `halfWidth <= 0`, because every
  // comparison against NaN is false and a NaN width would otherwise sail
  // through and produce a polygon of NaN points.
  if (count < 2 || !(halfWidth > 0) || !Number.isFinite(halfWidth)) return []

  const left: Point[] = []
  const right: Point[] = []

  for (let i = 0; i < count; i += 1) {
    const here = points[i]
    const before = points[Math.max(0, i - 1)]
    const after = points[Math.min(count - 1, i + 1)]
    if (here === undefined || before === undefined || after === undefined) continue

    const inX = here.x - before.x
    const inY = here.y - before.y
    const outX = after.x - here.x
    const outY = after.y - here.y
    const inLength = Math.hypot(inX, inY)
    const outLength = Math.hypot(outX, outY)

    // Average the two tangents, then take the perpendicular.
    let tx = 0
    let ty = 0
    if (inLength > 1e-9) {
      tx += inX / inLength
      ty += inY / inLength
    }
    if (outLength > 1e-9) {
      tx += outX / outLength
      ty += outY / outLength
    }
    const length = Math.hypot(tx, ty)
    if (length <= 1e-9) continue
    const nx = -ty / length
    const ny = tx / length

    const t = count === 1 ? 0 : i / (count - 1)
    const half = Math.max(0, halfWidth * widthAt(t))
    left.push({ x: here.x + nx * half, y: here.y + ny * half })
    right.push({ x: here.x - nx * half, y: here.y - ny * half })
  }

  if (left.length < 2) return []
  // One side out, the other side back, so the two sides close at both ends.
  return [...left, ...right.reverse()]
}

/**
 * A closed polygon approximating an ellipse, for a flower's disc.
 *
 * Written here rather than in the flower module because it is a brush mark: a
 * disc is what a loaded brush leaves when it is pressed and lifted without
 * travelling.
 */
export function ellipse(
  centre: Point,
  radiusX: number,
  radiusY: number,
  steps = 16,
): readonly Point[] {
  const points: Point[] = []
  for (let i = 0; i < steps; i += 1) {
    const angle = (i * 2 * Math.PI) / steps
    points.push({
      x: centre.x + radiusX * Math.cos(angle),
      y: centre.y + radiusY * Math.sin(angle),
    })
  }
  return points
}
