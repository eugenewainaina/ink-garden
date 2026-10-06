import { describe, expect, it } from 'vitest'
import { makeOrgan } from '../../src/dev/structure.ts'
import { buildShoot } from '../../src/dev/meristem.ts'
import { layoutShoot } from '../../src/dev/layout.ts'
import type { Shoot } from '../../src/dev/meristem.ts'

describe('layoutShoot', () => {
  const simple: Shoot = {
    internodes: [
      makeOrgan('internode', { x: 0, y: 0, angle: 0, scale: 1 }, 10, 0.1),
      makeOrgan('internode', { x: 0, y: 10, angle: 0, scale: 1 }, 10, 0.1),
    ],
    leaves: [makeOrgan('leaf', { x: 0, y: 10, angle: 90, scale: 1 }, 5, 1)],
    branches: [],
  }

  it('lays a vertical stem from the origin upward', () => {
    const segments = layoutShoot(simple)
    const stems = segments.filter((s) => s.kind === 'internode')
    expect(stems.length).toBe(2)
    expect(stems[0]?.x1).toBeCloseTo(0, 6)
    expect(stems[0]?.y1).toBeCloseTo(0, 6)
    expect(stems[0]?.y2).toBeCloseTo(10, 6)
    expect(stems[1]?.y1).toBeCloseTo(10, 6)
    expect(stems[1]?.y2).toBeCloseTo(20, 6)
  })

  it('is empty for an empty shoot', () => {
    expect(layoutShoot({ internodes: [], leaves: [], branches: [] })).toEqual([])
  })

  it('attaches a leaf at its node and sends it out at its angle', () => {
    const leaf = layoutShoot(simple).find((s) => s.kind === 'leaf')
    if (leaf === undefined) throw new Error('expected a leaf')
    // Node 0 is at height 10, and the leaf points 90 degrees, which is +x.
    expect(leaf.y1).toBeCloseTo(10, 6)
    expect(leaf.x2).toBeCloseTo(5, 6)
    expect(leaf.y2).toBeCloseTo(10, 6)
  })

  it('leans the whole shoot when given a base angle', () => {
    const stems = layoutShoot(simple, 0, 0, 90).filter((s) => s.kind === 'internode')
    // A 90 degree base angle points along +x, so the stem runs sideways.
    expect(stems[1]?.x2).toBeCloseTo(20, 6)
    expect(stems[1]?.y2).toBeCloseTo(0, 6)
  })

  it('rotates a branch to its own angle relative to the parent', () => {
    const branched: Shoot = {
      internodes: [makeOrgan('internode', { x: 0, y: 0, angle: 0, scale: 1 }, 10, 0.1)],
      leaves: [],
      branches: [
        {
          node: 0,
          angle: 45,
          shoot: {
            internodes: [
              makeOrgan('internode', { x: 0, y: 0, angle: 0, scale: 1 }, 10, 0.1),
            ],
            leaves: [],
            branches: [],
          },
        },
      ],
    }
    const stems = layoutShoot(branched).filter((s) => s.kind === 'internode')
    const branchStem = stems[1]
    if (branchStem === undefined) throw new Error('expected a branch stem')
    // Starts at the top of the parent internode, then leans 45 degrees.
    expect(branchStem.x1).toBeCloseTo(0, 6)
    expect(branchStem.y1).toBeCloseTo(10, 6)
    expect(branchStem.x2).toBeCloseTo(Math.sin(Math.PI / 4) * 10, 6)
    expect(branchStem.y2).toBeCloseTo(10 + Math.cos(Math.PI / 4) * 10, 6)
  })

  it('is deterministic', () => {
    expect(layoutShoot(simple)).toEqual(layoutShoot(simple))
  })

  it('produces one segment per internode and leaf across a real shoot', () => {
    const shoot = buildShoot({
      nodes: 8,
      pattern: 'spiral',
      internodeLength: 6,
      leafLength: 4,
      leafWidth: 1,
      apicalDominance: 0.5,
      branchAngle: 40,
      divergenceDeg: 55,
      seed: 'layout',
    })
    const segments = layoutShoot(shoot)
    expect(segments.length).toBeGreaterThan(0)
    expect(segments.some((s) => s.kind === 'leaf')).toBe(true)
    expect(segments.some((s) => s.kind === 'internode')).toBe(true)
    for (const segment of segments) {
      expect(Number.isFinite(segment.x2)).toBe(true)
      expect(Number.isFinite(segment.y2)).toBe(true)
    }
  })
})
