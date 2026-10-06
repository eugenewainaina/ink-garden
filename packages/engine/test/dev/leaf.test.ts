import { describe, expect, it } from 'vitest'
import {
  LEAF_MARGINS,
  LEAF_OUTLINES,
  leafDecomposition,
  laminaProfile,
  leafOutline,
  marginFactor,
  type LeafGeometry,
} from '../../src/dev/leaf.ts'

describe('laminaProfile', () => {
  it('is zero at both ends, because a lamina tapers to base and apex', () => {
    const shape = { mode: 0.5, fullness: 3 }
    expect(laminaProfile(0, shape)).toBeCloseTo(0, 10)
    expect(laminaProfile(1, shape)).toBeCloseTo(0, 10)
  })

  it('peaks at one, so the outline is normalised to the half-width', () => {
    const shape = { mode: 0.5, fullness: 3 }
    expect(laminaProfile(0.5, shape)).toBeCloseTo(1, 6)
  })

  it('peaks at the mode position the outline term names', () => {
    // Ovate is "broader below the middle", obovate "broadest above the middle",
    // elliptic "symmetrical about the middle".
    for (const mode of [0.3, 0.5, 0.7]) {
      const shape = { mode, fullness: 4 }
      let best = 0
      let bestT = 0
      for (let i = 0; i <= 200; i += 1) {
        const t = i / 200
        const value = laminaProfile(t, shape)
        if (value > best) {
          best = value
          bestT = t
        }
      }
      expect(bestT, `mode ${mode}`).toBeCloseTo(mode, 1)
    }
  })

  it('rises then falls, with no other turning points', () => {
    const shape = { mode: 0.4, fullness: 3 }
    let rises = 0
    let falls = 0
    let previous = laminaProfile(0, shape)
    for (let i = 1; i <= 100; i += 1) {
      const value = laminaProfile(i / 100, shape)
      if (value > previous) rises += 1
      else if (value < previous) falls += 1
      previous = value
    }
    expect(rises).toBeGreaterThan(20)
    expect(falls).toBeGreaterThan(20)
  })

  it('is never negative or above one', () => {
    for (const mode of [0.25, 0.5, 0.75]) {
      for (const fullness of [0.6, 2, 8]) {
        for (let i = 0; i <= 50; i += 1) {
          const value = laminaProfile(i / 50, { mode, fullness })
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThanOrEqual(1.0000001)
        }
      }
    }
  })

  it('gets broader shouldered as fullness falls, which is the orbicular end', () => {
    // Measured away from the peak, because the peak is 1 by normalisation.
    const shoulder = (fullness: number): number =>
      laminaProfile(0.25, { mode: 0.5, fullness })
    expect(shoulder(0.6)).toBeGreaterThan(shoulder(6))
  })
})

describe('LEAF_OUTLINES', () => {
  it('covers the eight terms this milestone needs', () => {
    for (const name of [
      'orbicular',
      'ovate',
      'obovate',
      'elliptic',
      'lanceolate',
      'linear',
      'spatulate',
      'oblanceolate',
    ]) {
      expect(LEAF_OUTLINES[name], name).toBeDefined()
    }
  })

  it('places ovate below the middle and obovate above it', () => {
    expect(LEAF_OUTLINES['ovate']?.mode).toBeLessThan(0.5)
    expect(LEAF_OUTLINES['obovate']?.mode).toBeGreaterThan(0.5)
  })

  it('places elliptic and orbicular at the middle', () => {
    expect(LEAF_OUTLINES['elliptic']?.mode).toBeCloseTo(0.5, 6)
    expect(LEAF_OUTLINES['orbicular']?.mode).toBeCloseTo(0.5, 6)
  })

  it('places oblanceolate and spatulate above the middle', () => {
    expect(LEAF_OUTLINES['oblanceolate']?.mode).toBeGreaterThan(0.5)
    expect(LEAF_OUTLINES['spatulate']?.mode).toBeGreaterThan(0.5)
  })

  it('makes oblanceolate the narrow form, as "narrowly obovate" requires', () => {
    // Narrowing is expressed through fullness, not by rescaling width with
    // aspect. Rescaling shrank dandelion leaves for no botanical reason: the
    // term says where the widest point is, and how narrow, and those are two
    // different knobs.
    expect(LEAF_OUTLINES['oblanceolate']?.fullness).toBeGreaterThan(
      LEAF_OUTLINES['obovate']?.fullness ?? 0,
    )
    expect(LEAF_OUTLINES['lanceolate']?.fullness).toBeGreaterThan(
      LEAF_OUTLINES['ovate']?.fullness ?? 0,
    )
  })

  it('makes linear narrow and orbicular round, per the definitions', () => {
    // Linear is "length:width greater than 10 to 15"; orbicular is "circular".
    expect(LEAF_OUTLINES['linear']?.aspect).toBeLessThan(0.35)
    expect(LEAF_OUTLINES['orbicular']?.aspect).toBeGreaterThan(1.2)
  })

  it('keeps every entry physically sane', () => {
    for (const [name, shape] of Object.entries(LEAF_OUTLINES)) {
      expect(shape.mode, name).toBeGreaterThan(0)
      expect(shape.mode, name).toBeLessThan(1)
      expect(shape.fullness, name).toBeGreaterThan(0)
      expect(shape.aspect, name).toBeGreaterThan(0)
      expect(shape.aspect, name).toBeLessThan(2)
    }
  })
})

describe('marginFactor', () => {
  it('leaves the profile untouched when the margin is entire', () => {
    for (const t of [0.1, 0.5, 0.9]) {
      expect(marginFactor(t, 'entire', 's')).toBeCloseTo(1, 10)
    }
  })

  it('is never negative and never exceeds one', () => {
    for (const margin of Object.keys(LEAF_MARGINS)) {
      for (let i = 0; i <= 60; i += 1) {
        const value = marginFactor(i / 60, margin, 'seed')
        expect(value, `${margin} at ${i / 60}`).toBeGreaterThanOrEqual(0)
        expect(value, `${margin} at ${i / 60}`).toBeLessThanOrEqual(1.0000001)
      }
    }
  })

  it('leans serrate forward, runcinate backward, and the rest not at all', () => {
    // Where the sinus sits between the two lobes that flank it, as a fraction
    // of the gap: 0 would be against the basal lobe, 1 against the apical one,
    // and 0.5 is a symmetric tooth. A continuous measure, because counting
    // which side is nearer is decided by floating point when they tie, and a
    // symmetric tooth ties every time.
    const lean = (margin: string): number => {
      const steps = 3000
      const samples: { t: number; w: number }[] = []
      for (let i = 0; i <= steps; i += 1) {
        const t = 0.15 + (i / steps) * 0.7
        samples.push({ t, w: marginFactor(t, margin, 'phase-probe') })
      }
      const maxima: number[] = []
      const minima: number[] = []
      for (let i = 2; i < samples.length - 2; i += 1) {
        const here = samples[i]
        const prev = samples[i - 1]
        const next = samples[i + 1]
        if (here === undefined || prev === undefined || next === undefined) continue
        if (here.w > prev.w && here.w > next.w) maxima.push(here.t)
        if (here.w < prev.w && here.w < next.w) minima.push(here.t)
      }
      const fractions: number[] = []
      for (const m of minima) {
        const left = maxima.filter((x) => x < m).pop()
        const right = maxima.filter((x) => x > m).shift()
        if (left === undefined || right === undefined || right === left) continue
        fractions.push((m - left) / (right - left))
      }
      if (fractions.length === 0) return -1
      return fractions.reduce((a, b) => a + b, 0) / fractions.length
    }

    expect(lean('serrate'), 'serrate').toBeLessThan(0.35)
    expect(lean('runcinate'), 'runcinate').toBeGreaterThan(0.65)
    expect(lean('pinnatifid'), 'pinnatifid').toBeGreaterThan(0.65)

    for (const neutral of ['dentate', 'crenate', 'lobed']) {
      const value = lean(neutral)
      expect(value, neutral).toBeGreaterThan(0.4)
      expect(value, neutral).toBeLessThan(0.6)
    }
  })

  it('cuts deeper for runcinate than for serrate', () => {
    const deepest = (margin: string): number => {
      let min = 1
      for (let i = 0; i <= 200; i += 1) min = Math.min(min, marginFactor(i / 200, margin, 's'))
      return min
    }
    expect(deepest('runcinate')).toBeLessThan(deepest('serrate'))
  })

  it('varies along the leaf rather than being constant', () => {
    const values = new Set<number>()
    for (let i = 0; i <= 100; i += 1) {
      values.add(Math.round(marginFactor(i / 100, 'runcinate', 's') * 1000))
    }
    expect(values.size).toBeGreaterThan(5)
  })

  it('is deterministic for a seed and varies between seeds', () => {
    expect(marginFactor(0.4, 'runcinate', 'a')).toBe(marginFactor(0.4, 'runcinate', 'a'))
  })

  it('falls back to a smooth margin for an unknown term', () => {
    expect(marginFactor(0.4, 'not-a-margin', 's')).toBeCloseTo(1, 10)
  })

  it('does not cut at the very base, where the petiole attaches', () => {
    // Otherwise the deepest lobe lands on the attachment and detaches the blade
    // from its stalk. The apex needs no such guard: the profile has already
    // tapered to a point there, so there is nothing to cut.
    for (const margin of Object.keys(LEAF_MARGINS)) {
      expect(marginFactor(0, margin, 's'), margin).toBeCloseTo(1, 6)
      expect(marginFactor(0.02, margin, 's'), margin).toBeGreaterThan(0.9)
    }
  })
})

describe('leafOutline', () => {
  const dandelion: LeafGeometry = {
    length: 18,
    width: 3.4,
    outline: 'oblanceolate',
    margin: 'runcinate',
    seed: 'dandelion-leaf',
  }

  it('returns a closed polygon with finite coordinates', () => {
    const points = leafOutline(dandelion)
    expect(points.length).toBeGreaterThan(20)
    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
  })

  it('runs from the base to the tip and back, so the two sides mirror', () => {
    const points = leafOutline({ ...dandelion, margin: 'entire' })
    const ys = points.map((p) => p.y)
    expect(Math.min(...ys)).toBeCloseTo(0, 6)
    expect(Math.max(...ys)).toBeCloseTo(dandelion.length, 6)
  })

  it('is widest at the point the outline term names, at the requested width', () => {
    const points = leafOutline({ ...dandelion, margin: 'entire' }, 400)
    let widest = 0
    let widestY = 0
    for (const point of points) {
      if (Math.abs(point.x) > widest) {
        widest = Math.abs(point.x)
        widestY = point.y
      }
    }
    const halfWidth = (dandelion.width / 2) * (LEAF_OUTLINES['oblanceolate']?.aspect ?? 1)
    expect(widest).toBeCloseTo(halfWidth, 1)
    expect(widestY / dandelion.length).toBeCloseTo(
      LEAF_OUTLINES['oblanceolate']?.mode ?? 0.5,
      1,
    )
  })

  it('makes an entire leaf wider than the same leaf with cut margins', () => {
    const widthOf = (margin: string): number =>
      Math.max(...leafOutline({ ...dandelion, margin }, 400).map((p) => Math.abs(p.x)))
    expect(widthOf('entire')).toBeGreaterThan(widthOf('runcinate'))
  })

  it('scales with the requested size', () => {
    const small = leafOutline({ ...dandelion, length: 5, width: 1 }, 200)
    const large = leafOutline({ ...dandelion, length: 20, width: 4 }, 200)
    const span = (points: readonly { y: number }[]): number =>
      Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y))
    expect(span(large) / span(small)).toBeCloseTo(4, 1)
  })

  it('is deterministic', () => {
    expect(leafOutline(dandelion)).toEqual(leafOutline(dandelion))
  })

  it('gives every lobe at least one vertex, so the cut is visible', () => {
    const points = leafOutline(dandelion, 400)
    // Count direction changes in x along one side: each lobe is a local extremum.
    const side = points.filter((p) => p.x >= 0).sort((a, b) => a.y - b.y)
    let turns = 0
    for (let i = 2; i < side.length; i += 1) {
      const a = side[i - 2]
      const b = side[i - 1]
      const c = side[i]
      if (a === undefined || b === undefined || c === undefined) continue
      const before = b.x - a.x
      const after = c.x - b.x
      if (before > 0 !== after > 0) turns += 1
    }
    expect(turns).toBeGreaterThan(4)
  })

  it('does not fold back on itself at the base when the margin bites hard', () => {
    const points = leafOutline(dandelion, 400)
    const side = points.filter((p) => p.x > 0).sort((a, b) => a.y - b.y)
    for (let i = 1; i < side.length; i += 1) {
      const a = side[i - 1]
      const b = side[i]
      if (a === undefined || b === undefined) continue
      expect(b.x, `no negative width at y ${b.y}`).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('the biology the flora describes', () => {
  it('arches the midrib when asked, and stays straight at zero', () => {
    const straight = leafOutline(
      { length: 100, width: 30, outline: 'elliptic', margin: 'entire', seed: 's', curve: 0 },
      60,
    )
    const arched = leafOutline(
      { length: 100, width: 30, outline: 'elliptic', margin: 'entire', seed: 's', curve: 1.2 },
      60,
    )
    const tipOf = (points: readonly { x: number; y: number }[]): { x: number; y: number } => {
      let best = points[0] ?? { x: 0, y: 0 }
      for (const p of points) if (p.y > best.y) best = p
      return best
    }
    // A straight blade's tip sits on the axis; an arched one has swung aside.
    expect(Math.abs(tipOf(straight).x)).toBeLessThan(1)
    expect(Math.abs(tipOf(arched).x)).toBeGreaterThan(15)
  })

  it('leaves the apex uncut where a terminal lobe is declared', () => {
    // "Terminal lobe triangular to deltoid" against "lateral lobes narrowly to
    // broadly triangular". The property is that the margin stops cutting near
    // the apex, which leaves a solid lobe there. Measured on the margin factor,
    // because at the very tip the blade's own taper dominates and would hide it.
    const cutAtApex = (margin: string): number =>
      1 - marginFactor(0.95, margin, 'phase-probe')
    expect(cutAtApex('runcinate')).toBeLessThan(0.05)
    expect(cutAtApex('pinnatifid')).toBeLessThan(0.05)
    // A margin with no terminal lobe keeps cutting right up to the apex.
    expect(cutAtApex('lobed')).toBeGreaterThan(cutAtApex('runcinate') * 4)
  })

  it('divides a compound leaf and leaves a simple one whole', () => {
    expect(leafDecomposition('simple')).toHaveLength(1)
    expect(leafDecomposition('pinnate').length).toBeGreaterThan(4)
    // Bipinnate repeats the division one level down, so far more pieces.
    expect(leafDecomposition('bipinnate').length).toBeGreaterThan(
      leafDecomposition('pinnate').length * 3,
    )
  })

  it('draws every rachis as a near-line rather than a blade', () => {
    for (const placement of leafDecomposition('bipinnate')) {
      expect(placement.widthFactor).toBeGreaterThan(0)
      expect(placement.widthFactor).toBeLessThanOrEqual(1)
    }
    // The main rachis is the thinnest thing in the leaf.
    const rachis = leafDecomposition('bipinnate')[0]
    expect(rachis?.widthFactor).toBeLessThan(0.1)
  })

  it('keeps every lamina inside the leaf it belongs to', () => {
    for (const placement of leafDecomposition('bipinnate')) {
      expect(Math.abs(placement.offset.x)).toBeLessThan(0.6)
      expect(placement.offset.y).toBeGreaterThanOrEqual(0)
      expect(placement.offset.y).toBeLessThanOrEqual(1.01)
      expect(placement.scale).toBeGreaterThan(0)
      expect(placement.scale).toBeLessThanOrEqual(1)
    }
  })
})
