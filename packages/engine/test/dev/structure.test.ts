import { describe, expect, it } from 'vitest'
import {
  countOrgans,
  describeStructure,
  flatten,
  heightOf,
  leafAreaOf,
  makeOrgan,
  type Organ,
} from '../../src/dev/structure.ts'

const tip: Organ = makeOrgan('flower', { x: 0, y: 3, angle: 0, scale: 1 }, 1, 1)

describe('makeOrgan', () => {
  it('carries an identity, a transform and a size', () => {
    expect(tip.kind).toBe('flower')
    expect(tip.transform.y).toBe(3)
    expect(tip.children).toEqual([])
  })

  it('defaults to no children and supports them', () => {
    const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 3, 0.2, [tip])
    expect(stem.children.length).toBe(1)
    expect(stem.children[0]).toBe(tip)
  })

  it('does not share the children array between organs', () => {
    const a = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 1, 1)
    const b = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 1, 1)
    expect(a.children).not.toBe(b.children)
  })
})

describe('traversal', () => {
  const leafA = makeOrgan('leaf', { x: 1, y: 1, angle: 0, scale: 1 }, 2, 1)
  const leafB = makeOrgan('leaf', { x: -1, y: 2, angle: 90, scale: 1 }, 3, 1)
  const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 3, 0.2, [
    leafA,
    leafB,
  ])

  it('counts every organ including the root', () => {
    expect(countOrgans(stem)).toBe(3)
  })

  it('flattens in a stable depth-first order', () => {
    expect(flatten(stem).map((o) => o.kind)).toEqual(['stem', 'leaf', 'leaf'])
  })

  it('visits the root first and each organ once', () => {
    const all = flatten(stem)
    expect(all[0]).toBe(stem)
    expect(new Set(all).size).toBe(all.length)
  })

  it('reports height as the highest y, not the sum of lengths', () => {
    expect(heightOf(stem)).toBe(2)
  })

  it('descends into grandchildren', () => {
    const deep = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 1, 1, [
      makeOrgan('internode', { x: 0, y: 1, angle: 0, scale: 1 }, 1, 1, [
        makeOrgan('leaf', { x: 0, y: 9, angle: 0, scale: 1 }, 1, 1),
      ]),
    ])
    expect(heightOf(deep)).toBe(9)
    expect(countOrgans(deep)).toBe(3)
  })

  it('sums leaf area over leaves only', () => {
    // two leaves of length 2 and 3, width 1, approximated as length * width
    expect(leafAreaOf(stem)).toBeCloseTo(5, 6)
  })

  it('ignores non-leaf organs when measuring leaf area', () => {
    const onlyStems = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 100, 100, [
      makeOrgan('internode', { x: 0, y: 1, angle: 0, scale: 1 }, 50, 50),
      makeOrgan('thorn', { x: 1, y: 1, angle: 0, scale: 1 }, 5, 5),
    ])
    expect(leafAreaOf(onlyStems)).toBe(0)
  })

  it('handles a single organ', () => {
    expect(countOrgans(tip)).toBe(1)
    expect(heightOf(tip)).toBe(3)
    expect(leafAreaOf(tip)).toBe(0)
  })
})

describe('describeStructure', () => {
  it('derives the totals from the root rather than taking them on trust', () => {
    const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 10, 1, [
      makeOrgan('leaf', { x: 0, y: 2, angle: 0, scale: 1 }, 4, 2),
    ])
    const structure = describeStructure(stem, 'bloom', 0.8)
    expect(structure.organCount).toBe(2)
    expect(structure.height).toBe(2)
    expect(structure.leafArea).toBeCloseTo(8, 6)
    expect(structure.stage).toBe('bloom')
    expect(structure.plausibilityScore).toBe(0.8)
  })

  it('keeps the root by reference, so a caller can walk it', () => {
    const structure = describeStructure(tip, 'germination', 1)
    expect(structure.root).toBe(tip)
  })
})
