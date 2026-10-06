import { describe, expect, it } from 'vitest'
import {
  BUCKLING_COEFFICIENT,
  bucklingRadius,
  PIPE_COEFFICIENT,
  allometryFor,
  cornerLeafScale,
  maxHeightForRadius,
  pipeModelRadius,
  plausibility,
  requiredRadius,
  taperedRadius,
} from '../../src/dev/allometry.ts'
import { makeOrgan, describeStructure, type Organ } from '../../src/dev/structure.ts'

const leaf = (y: number, length: number, width: number): Organ =>
  makeOrgan('leaf', { x: 0, y, angle: 0, scale: 1 }, length, width)

const stemWith = (children: readonly Organ[], length = 10, width = 0.2): Organ =>
  makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, length, width, children)

describe('pipeModelRadius', () => {
  it('is zero for no leaves', () => {
    expect(pipeModelRadius(0)).toBe(0)
  })

  it('grows as the square root of leaf area, which is the pipe model', () => {
    // Four times the leaf area needs twice the radius, because area is what is
    // being supplied and radius is the square root of it.
    expect(pipeModelRadius(40) / pipeModelRadius(10)).toBeCloseTo(2, 6)
  })

  it('is monotonic in leaf area', () => {
    let previous = -1
    for (const area of [0, 1, 5, 20, 100, 1000]) {
      const radius = pipeModelRadius(area)
      expect(radius).toBeGreaterThanOrEqual(previous)
      previous = radius
    }
  })

  it("puts a real rosemary shoot's stem at a couple of millimetres", () => {
    // 20 leaves of 3 cm by 2.4 mm is about 14 square centimetres of leaf, which
    // a real rosemary shoot carries on a stem 2 to 3 mm across.
    const radius = pipeModelRadius(14.1)
    expect(radius).toBeGreaterThan(0.08)
    expect(radius).toBeLessThan(0.2)
  })

  it("puts a jacaranda sapling's trunk on the order of a few centimetres", () => {
    // 32 bipinnate leaves of about 26 cm is roughly 0.9 square metres of leaf.
    const radius = pipeModelRadius(8986)
    expect(radius).toBeGreaterThan(1.5)
    expect(radius).toBeLessThan(6)
  })
})

describe('maxHeightForRadius', () => {
  it('is larger for a thicker stem', () => {
    expect(maxHeightForRadius(2)).toBeGreaterThan(maxHeightForRadius(1))
  })

  it('grows sublinearly, so height has diminishing returns', () => {
    const doubled = maxHeightForRadius(2) / maxHeightForRadius(1)
    expect(doubled).toBeGreaterThan(1.3)
    expect(doubled).toBeLessThan(2)
  })

  it('is zero for a stem with no thickness', () => {
    expect(maxHeightForRadius(0)).toBe(0)
  })
})

describe('requiredRadius', () => {
  it('is the pipe model radius when buckling is not binding', () => {
    const pipe = pipeModelRadius(10)
    expect(requiredRadius(10, 1)).toBeCloseTo(pipe, 6)
  })

  it('thickens a stem that is too thin for its height', () => {
    const pipe = pipeModelRadius(1)
    expect(requiredRadius(1, 400)).toBeGreaterThan(pipe)
  })

  it('always satisfies the buckling limit it had to meet', () => {
    for (const [area, height] of [[1, 50], [10, 200], [100, 1000]] as const) {
      const radius = requiredRadius(area, height)
      expect(height).toBeLessThanOrEqual(maxHeightForRadius(radius) * 1.0001)
    }
  })

  it('never returns less than the pipe model needs', () => {
    for (const area of [0.5, 5, 50]) {
      expect(requiredRadius(area, 1)).toBeGreaterThanOrEqual(pipeModelRadius(area) - 1e-9)
    }
  })
})

describe('taperedRadius', () => {
  it('is the full radius at the base', () => {
    expect(taperedRadius(1, 0)).toBeCloseTo(1, 6)
  })

  it('is thinnest at the top, because no leaves sit above it', () => {
    expect(taperedRadius(1, 1)).toBeLessThan(taperedRadius(1, 0.5))
    expect(taperedRadius(1, 1)).toBeGreaterThan(0)
  })

  it('falls as the square root, the same relation as the pipe model', () => {
    // A quarter of the leaf area above means half the radius.
    expect(taperedRadius(1, 0.75)).toBeCloseTo(Math.sqrt(0.25), 6)
  })

  it('never goes negative, even asked for a fraction beyond the tip', () => {
    expect(taperedRadius(1, 5)).toBeGreaterThan(0)
    expect(taperedRadius(1, -3)).toBeCloseTo(1, 6)
  })
})

describe('allometryFor', () => {
  it("reads the plant's own leaf area and height", () => {
    const structure = describeStructure(
      stemWith([leaf(1, 4, 2), leaf(2, 4, 2)], 20),
      'bloom',
      1,
    )
    const allometry = allometryFor(structure)
    expect(allometry.leafArea).toBeCloseTo(16, 6)
    expect(allometry.height).toBe(2)
    expect(allometry.baseRadius).toBeGreaterThan(0)
  })

  it('thickens a plant as its leaves grow', () => {
    const small = allometryFor(describeStructure(stemWith([leaf(1, 2, 1)]), 'bloom', 1))
    const large = allometryFor(
      describeStructure(stemWith([leaf(1, 8, 4), leaf(2, 8, 4)]), 'bloom', 1),
    )
    expect(large.baseRadius).toBeGreaterThan(small.baseRadius)
  })

  it('reports when buckling rather than the pipe model set the radius', () => {
    const short = allometryFor(describeStructure(stemWith([leaf(1, 4, 2)], 3), 'bloom', 1))
    expect(short.bucklingLimited).toBe(false)
  })

  it('has no radius for a plant with no leaves', () => {
    expect(allometryFor(describeStructure(stemWith([]), 'bloom', 1)).baseRadius).toBe(0)
  })
})

describe('cornerLeafScale', () => {
  it('is no correction for a sparsely branched shoot', () => {
    for (const count of [0, 1, 2, 3]) expect(cornerLeafScale(count)).toBe(1)
  })

  it("shrinks leaves as ramification rises, per Corner's rules", () => {
    // Confirmed on Leucadendron: more highly ramified shoots have smaller leaves.
    expect(cornerLeafScale(6)).toBeLessThan(cornerLeafScale(4))
    expect(cornerLeafScale(18)).toBeLessThan(cornerLeafScale(6))
  })

  it('stays gentle, because the correlation is a trend and not a law', () => {
    expect(cornerLeafScale(1000)).toBeGreaterThan(0.5)
    expect(cornerLeafScale(1000)).toBeLessThan(1)
  })
})

describe('plausibility', () => {
  it('scores between zero and one for any plant', () => {
    for (const width of [0.001, 0.01, 0.1, 1, 10, 100]) {
      const structure = describeStructure(
        stemWith([leaf(1, 5, 5), leaf(2, 5, 5)], 10, width),
        'bloom',
        1,
      )
      const score = plausibility(structure)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })

  it('scores a stem that is too thin for its leaves poorly', () => {
    const thin = describeStructure(
      stemWith([leaf(1, 40, 30), leaf(2, 40, 30)], 5, 0.01),
      'bloom',
      1,
    )
    const right = describeStructure(
      stemWith([leaf(1, 40, 30), leaf(2, 40, 30)], 5, pipeModelRadius(2400) * 2),
      'bloom',
      1,
    )
    expect(plausibility(thin)).toBeLessThan(plausibility(right))
  })
})

describe('the constants are the published ones', () => {
  it("uses Greenhill's two-thirds exponent and a documented coefficient", () => {
    expect(BUCKLING_COEFFICIENT).toBeGreaterThan(0)
    const ratio = maxHeightForRadius(4) / maxHeightForRadius(1)
    expect(ratio).toBeCloseTo(Math.pow(4, 2 / 3), 6)
  })

  it('keeps the pipe coefficient in centimetres', () => {
    expect(PIPE_COEFFICIENT).toBeGreaterThan(0)
    expect(PIPE_COEFFICIENT).toBeLessThan(1)
  })
})

describe('bucklingRadius', () => {
  it('inverts maxHeightForRadius exactly', () => {
    for (const height of [5, 40, 400, 1600]) {
      expect(maxHeightForRadius(bucklingRadius(height))).toBeCloseTo(height, 4)
    }
  })

  it('matches the trees you can measure', () => {
    // A 1 cm stem stands about a metre; a 2.5 mm shoot about 40 cm.
    const oneCm = maxHeightForRadius(0.5)
    expect(oneCm).toBeGreaterThan(80)
    expect(oneCm).toBeLessThan(130)
    const twoAndAHalfMm = maxHeightForRadius(0.125)
    expect(twoAndAHalfMm).toBeGreaterThan(30)
    expect(twoAndAHalfMm).toBeLessThan(55)
  })

  it('is zero for no height', () => {
    expect(bucklingRadius(0)).toBe(0)
  })
})
