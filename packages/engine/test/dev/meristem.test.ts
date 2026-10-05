import { describe, expect, it } from 'vitest'
import {
  GOLDEN_ANGLE,
  growPhytomers,
  leavesPerNode,
  nextBudAngle,
  phyllotaxisAngle,
  type PhytomerConfig,
} from '../../src/dev/meristem.ts'

describe('phyllotaxis', () => {
  it('uses the golden angle for a spiral', () => {
    expect(phyllotaxisAngle('spiral')).toBeCloseTo(GOLDEN_ANGLE, 6)
    expect(GOLDEN_ANGLE).toBeGreaterThan(137.5)
    expect(GOLDEN_ANGLE).toBeLessThan(137.6)
  })

  it('uses a half turn for alternate', () => {
    expect(phyllotaxisAngle('alternate')).toBeCloseTo(180, 6)
  })

  it('uses a quarter turn for decussate pairs', () => {
    expect(phyllotaxisAngle('decussate')).toBeCloseTo(90, 6)
    expect(leavesPerNode('decussate')).toBe(2)
  })

  it('uses a third of a turn for whorls of three', () => {
    expect(phyllotaxisAngle('whorled')).toBeCloseTo(120, 6)
    expect(leavesPerNode('whorled')).toBe(3)
  })

  it('gives one leaf per node except for opposite and whorled', () => {
    expect(leavesPerNode('alternate')).toBe(1)
    expect(leavesPerNode('spiral')).toBe(1)
  })
})

describe('nextBudAngle', () => {
  it('advances by the phyllotaxis angle per node', () => {
    expect(nextBudAngle('spiral', 0)).toBeCloseTo(0, 6)
    expect(nextBudAngle('spiral', 1)).toBeCloseTo(GOLDEN_ANGLE, 6)
    expect(nextBudAngle('spiral', 2)).toBeCloseTo(2 * GOLDEN_ANGLE, 6)
  })

  it('stays within zero to 360 degrees', () => {
    for (let node = 0; node < 60; node += 1) {
      const angle = nextBudAngle('spiral', node)
      expect(angle, `node ${node}`).toBeGreaterThanOrEqual(0)
      expect(angle, `node ${node}`).toBeLessThan(360)
    }
  })

  it('never repeats within a plausible node count for a spiral', () => {
    // The golden angle is irrational, so no two of the first N leaves line up.
    // This is the property that makes a spiral plant look like a plant rather
    // than a stack of identical leaves.
    const seen = new Set<number>()
    for (let node = 0; node < 12; node += 1) {
      seen.add(Math.round(nextBudAngle('spiral', node) * 100))
    }
    expect(seen.size).toBe(12)
  })

  it('repeats predictably for alternate, which is the point of alternate', () => {
    expect(nextBudAngle('alternate', 0)).toBeCloseTo(nextBudAngle('alternate', 2), 6)
  })

  it('alternates sides for decussate, pair by pair', () => {
    expect(nextBudAngle('decussate', 0)).toBeCloseTo(0, 6)
    expect(nextBudAngle('decussate', 1)).toBeCloseTo(90, 6)
    expect(nextBudAngle('decussate', 2)).toBeCloseTo(180, 6)
    expect(nextBudAngle('decussate', 3)).toBeCloseTo(270, 6)
  })
})

describe('growPhytomers', () => {
  const config: PhytomerConfig = {
    nodes: 8,
    pattern: 'spiral',
    internodeLength: 10,
    leafLength: 6,
    leafWidth: 2,
    seed: 'phyto',
  }

  it('produces one internode and one leaf per node for a spiral', () => {
    const result = growPhytomers(config)
    expect(result.internodes.length).toBe(8)
    expect(result.leaves.length).toBe(8)
  })

  it('produces a pair of leaves per node for decussate', () => {
    const result = growPhytomers({ ...config, pattern: 'decussate' })
    expect(result.internodes.length).toBe(8)
    expect(result.leaves.length).toBe(16)
  })

  it('produces a whorl of three per node for whorled', () => {
    expect(growPhytomers({ ...config, pattern: 'whorled' }).leaves.length).toBe(24)
  })

  it('stacks internodes upward from the base', () => {
    const ys = growPhytomers(config).internodes.map((o) => o.transform.y)
    expect(ys[0]).toBeCloseTo(0, 6)
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i], `internode ${i}`).toBeGreaterThan(ys[i - 1] ?? 0)
    }
  })

  it('spaces internodes near the requested length, with organic variation', () => {
    const internodes = growPhytomers(config).internodes
    for (const internode of internodes) {
      expect(internode.length).toBeGreaterThan(config.internodeLength * 0.8)
      expect(internode.length).toBeLessThan(config.internodeLength * 1.2)
    }
    const total = internodes.reduce((sum, o) => sum + o.length, 0)
    expect(total).toBeGreaterThan(config.nodes * config.internodeLength * 0.9)
    expect(total).toBeLessThan(config.nodes * config.internodeLength * 1.1)
  })

  it('does not space them all identically, because real internodes vary', () => {
    const lengths = growPhytomers(config).internodes.map((o) => o.length)
    expect(new Set(lengths.map((l) => l.toFixed(6))).size).toBeGreaterThan(1)
  })

  it('attaches each leaf at the top of its internode', () => {
    const result = growPhytomers(config)
    // Node 0's leaf sits at the top of internode 0.
    expect(result.leaves[0]?.transform.y).toBeCloseTo(
      result.internodes[0]?.length ?? 0,
      6,
    )
  })

  it('is deterministic for a seed', () => {
    expect(growPhytomers(config)).toEqual(growPhytomers(config))
  })

  it('differs for a different seed, because the jitter does', () => {
    expect(growPhytomers(config)).not.toEqual(
      growPhytomers({ ...config, seed: 'other' }),
    )
  })

  it('spirals the leaves rather than stacking them', () => {
    const angles = growPhytomers(config).leaves.map((o) => o.transform.angle)
    expect(new Set(angles.map((a) => Math.round(a))).size).toBeGreaterThan(5)
  })

  it('places a decussate pair at right angles, unlike a spiral', () => {
    const angles = growPhytomers({ ...config, pattern: 'decussate' }).leaves.map(
      (o) => o.transform.angle,
    )
    // The first pair is at 0 and 180, the second at 90 and 270.
    expect(Math.round(angles[0] ?? 0)).toBe(0)
    expect(Math.round(angles[1] ?? 0)).toBe(180)
    expect(Math.round(angles[2] ?? 0)).toBe(90)
  })

  it('handles zero nodes without producing organs or throwing', () => {
    const result = growPhytomers({ ...config, nodes: 0 })
    expect(result.internodes).toEqual([])
    expect(result.leaves).toEqual([])
  })
})
