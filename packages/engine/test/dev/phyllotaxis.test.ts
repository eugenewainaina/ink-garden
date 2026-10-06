import { describe, expect, it } from 'vitest'
import {
  GOLDEN_ANGLE,
  leavesPerNode,
  nextBudAngle,
  phyllotaxisAngle,
  projectLeaf,
} from '../../src/dev/phyllotaxis.ts'

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

describe('projectLeaf', () => {
  it('draws a leaf at azimuth zero clear of the stem, at full length', () => {
    const projected = projectLeaf(0)
    expect(projected.angle).toBeCloseTo(55, 6)
    expect(projected.scale).toBeCloseTo(1, 6)
  })

  it('draws a leaf at azimuth 180 to the opposite side', () => {
    const projected = projectLeaf(180)
    expect(projected.angle).toBeCloseTo(-55, 6)
    expect(projected.scale).toBeCloseTo(1, 6)
  })

  it('foreshortens a leaf pointing at the viewer', () => {
    const projected = projectLeaf(90)
    expect(projected.angle).toBeCloseTo(0, 6)
    expect(projected.scale).toBeLessThan(0.7)
    expect(projected.scale).toBeGreaterThan(0.5)
  })

  it('keeps the scale within zero and one for every azimuth', () => {
    for (let azimuth = 0; azimuth < 360; azimuth += 7) {
      const projected = projectLeaf(azimuth)
      expect(projected.scale).toBeGreaterThan(0)
      expect(projected.scale).toBeLessThanOrEqual(1.0000001)
      expect(Math.abs(projected.angle)).toBeLessThanOrEqual(56)
    }
  })

  it('mirrors in the picture plane, which is azimuth 180 apart', () => {
    // Not 320: azimuths 40 and 320 differ in depth, not in the plane, and both
    // project to the same place. The in-plane mirror of 40 is 140.
    expect(projectLeaf(140).angle).toBeCloseTo(-projectLeaf(40).angle, 6)
    expect(projectLeaf(320).angle).toBeCloseTo(projectLeaf(40).angle, 6)
  })
})
