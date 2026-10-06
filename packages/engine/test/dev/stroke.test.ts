import { describe, expect, it } from 'vitest'
import { BRUSH_TAPER, POINTED_TAPER, ellipse, taperedStroke } from '../../src/dev/stroke.ts'

/**
 * The brush.
 *
 * The properties worth pinning are geometric rather than visual: a stroke of
 * varying width is a polygon, it closes, its width follows the taper, and it
 * does not pinch on the inside of a bend. Every one of those was wrong in some
 * earlier version of this idea.
 */
describe('taperedStroke', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 0, y: 5 },
    { x: 0, y: 10 },
  ]

  it('closes the two sides into a polygon', () => {
    const mark = taperedStroke(line, BRUSH_TAPER, 1)
    expect(mark.length).toBe(line.length * 2)
    // Twice round: one side out, the other back.
    const first = mark[0]
    const last = mark[mark.length - 1]
    expect(first?.x).toBeCloseTo(last?.x ?? NaN, 6)
    expect(first?.y).toBeCloseTo(last?.y ?? NaN, 6)
  })

  it('is widest where the taper says, and pointed where it says', () => {
    const mark = taperedStroke(line, BRUSH_TAPER, 2)
    const spanAt = (y: number): number => {
      const xs = mark.filter((p) => Math.abs(p.y - y) < 1e-6).map((p) => p.x)
      return xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs)
    }
    // A brush load and lift: nothing at either end, widest in the middle.
    expect(spanAt(0)).toBeCloseTo(0, 6)
    expect(spanAt(10)).toBeCloseTo(0, 6)
    expect(spanAt(5)).toBeCloseTo(4, 6)
  })

  it('runs a pointed stroke from full width to nothing', () => {
    const mark = taperedStroke(line, POINTED_TAPER, 2)
    const spanAt = (y: number): number => {
      const xs = mark.filter((p) => Math.abs(p.y - y) < 1e-6).map((p) => p.x)
      return xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs)
    }
    // Full at the base, a point at the tip: what a vein does.
    expect(spanAt(0)).toBeCloseTo(4, 6)
    expect(spanAt(10)).toBeCloseTo(0, 4)
  })

  it('keeps its width through a bend instead of pinching', () => {
    const bend = [
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 5, y: 5 },
    ]
    const mark = taperedStroke(bend, () => 1, 1)
    // The corner is offset along the bisector, so the two sides stay apart.
    const atCorner = mark.filter((p) => Math.abs(p.x) < 3 && Math.abs(p.y - 5) < 3)
    expect(atCorner.length).toBeGreaterThanOrEqual(2)
    const spread = Math.hypot(
      (atCorner[0]?.x ?? 0) - (atCorner[1]?.x ?? 0),
      (atCorner[0]?.y ?? 0) - (atCorner[1]?.y ?? 0),
    )
    expect(spread).toBeGreaterThan(1.5)
  })

  it('gives nothing for a degenerate stroke rather than throwing', () => {
    expect(taperedStroke([], BRUSH_TAPER, 1)).toEqual([])
    expect(taperedStroke([{ x: 0, y: 0 }], BRUSH_TAPER, 1)).toEqual([])
    expect(taperedStroke(line, BRUSH_TAPER, 0)).toEqual([])
    expect(taperedStroke(line, BRUSH_TAPER, Number.NaN)).toEqual([])
  })
})

describe('ellipse', () => {
  it('closes and sits on its radii', () => {
    const points = ellipse({ x: 3, y: 4 }, 2, 1, 12)
    expect(points.length).toBe(12)
    for (const point of points) {
      const dx = (point.x - 3) / 2
      const dy = (point.y - 4) / 1
      expect(dx * dx + dy * dy).toBeCloseTo(1, 6)
    }
  })
})
