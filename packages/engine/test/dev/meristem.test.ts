import { describe, expect, it } from 'vitest'
import { makeOrgan } from '../../src/dev/structure.ts'
import {
  GOLDEN_ANGLE,
  growPhytomers,
  leavesPerNode,
  nextBudAngle,
  phyllotaxisAngle,
  shouldBranch,
  buildShoot,
  layoutShoot,
  projectLeaf,
  type PhytomerConfig,
  type Shoot,
  type ShootConfig,
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

  it('draws a decussate pair to opposite sides, then a foreshortened pair', () => {
    const leaves = growPhytomers({ ...config, pattern: 'decussate' }).leaves
    // Node 0 carries azimuths 0 and 180, so its pair points clear of the stem
    // in opposite directions. Node 1 carries 90 and 270, so its pair points at
    // the viewer and is drawn short and parallel to the stem.
    expect(leaves[0]?.transform.angle).toBeGreaterThan(30)
    expect(leaves[1]?.transform.angle).toBeLessThan(-30)
    expect(leaves[0]?.transform.scale).toBeCloseTo(1, 6)
    expect(leaves[1]?.transform.scale).toBeCloseTo(1, 6)
    expect(Math.abs(leaves[2]?.transform.angle ?? 99)).toBeLessThan(5)
    expect(leaves[2]?.transform.scale).toBeLessThan(0.7)
  })

  it('alternates an alternate-leaved plant to opposite sides', () => {
    const leaves = growPhytomers({ ...config, pattern: 'alternate' }).leaves
    expect(leaves[0]?.transform.angle).toBeGreaterThan(30)
    expect(leaves[1]?.transform.angle).toBeLessThan(-30)
    expect(leaves[2]?.transform.angle).toBeGreaterThan(30)
  })

  it('draws a leaf along the stem only when it is foreshortened', () => {
    // Every leaf used to be collinear with the stem, because an azimuth was
    // used as an angle from vertical and alternate phyllotaxis gives 0 and 180.
    // A leaf parallel to the stem is legitimate only when it points at the
    // viewer, which is what the projection scale records.
    for (const pattern of ['alternate', 'decussate', 'whorled', 'spiral'] as const) {
      for (const leaf of growPhytomers({ ...config, pattern }).leaves) {
        const angled = Math.abs(leaf.transform.angle) > 15
        const foreshortened = leaf.transform.scale < 0.7
        expect(
          angled || foreshortened,
          `${pattern} leaf at ${leaf.transform.angle.toFixed(1)} deg, scale ${leaf.transform.scale.toFixed(2)}`,
        ).toBe(true)
      }
    }
  })

  it('handles zero nodes without producing organs or throwing', () => {
    const result = growPhytomers({ ...config, nodes: 0 })
    expect(result.internodes).toEqual([])
    expect(result.leaves).toEqual([])
  })
})

describe('shouldBranch', () => {
  it('never branches under total apical dominance', () => {
    for (const r of [0, 0.5, 0.999]) {
      expect(shouldBranch(1, 5, r)).toBe(false)
    }
  })

  it('always branches with no apical dominance', () => {
    for (const r of [0, 0.5, 0.999]) {
      expect(shouldBranch(0, 5, r)).toBe(true)
    }
  })

  it('branches less as dominance rises', () => {
    const count = (dominance: number): number => {
      let n = 0
      for (let i = 0; i < 200; i += 1) {
        if (shouldBranch(dominance, 4, (i + 0.5) / 200)) n += 1
      }
      return n
    }
    expect(count(0.2)).toBeGreaterThan(count(0.6))
    expect(count(0.6)).toBeGreaterThan(count(0.9))
  })

  it('does not branch at the lowest node', () => {
    expect(shouldBranch(0, 0, 0)).toBe(false)
  })
})

describe('buildShoot', () => {
  const shootConfig: ShootConfig = {
    nodes: 10,
    pattern: 'spiral',
    internodeLength: 8,
    leafLength: 5,
    leafWidth: 2,
    apicalDominance: 0.4,
    branchAngle: 40,
    seed: 'shoot',
  }

  it('is deterministic', () => {
    expect(buildShoot(shootConfig)).toEqual(buildShoot(shootConfig))
  })

  it('always has a main axis', () => {
    expect(buildShoot(shootConfig).internodes.length).toBe(shootConfig.nodes)
  })

  it('produces branches when dominance is low and none when it is total', () => {
    const bushy = buildShoot({ ...shootConfig, apicalDominance: 0 })
    const sparse = buildShoot({ ...shootConfig, apicalDominance: 1 })
    expect(bushy.branches.length).toBeGreaterThan(sparse.branches.length)
    expect(sparse.branches.length).toBe(0)
  })

  it('branches at the configured angle, to either side', () => {
    const bushy = buildShoot({ ...shootConfig, apicalDominance: 0 })
    const first = bushy.branches[0]
    if (first === undefined) throw new Error('expected at least one branch')
    expect(Math.abs(first.angle)).toBeCloseTo(shootConfig.branchAngle, 6)
  })

  it('records the node each branch came from, so it can be placed', () => {
    const bushy = buildShoot({ ...shootConfig, apicalDominance: 0 })
    expect(bushy.branches.length).toBeGreaterThan(0)
    for (const branch of bushy.branches) {
      expect(branch.node).toBeGreaterThanOrEqual(1)
      expect(branch.node).toBeLessThan(shootConfig.nodes)
    }
  })

  it('branches less as you go up, because dominance rises with depth', () => {
    const bushy = buildShoot({ ...shootConfig, apicalDominance: 0 })
    const deepest = bushy.branches[0]?.shoot.branches.length ?? 0
    expect(deepest).toBeLessThanOrEqual(bushy.branches.length)
  })

  it('caps depth, so an undominated plant does not recurse forever', () => {
    const depthOf = (shoot: Shoot): number =>
      shoot.branches.length === 0
        ? 0
        : 1 + Math.max(...shoot.branches.map((b) => depthOf(b.shoot)))
    const bushy = buildShoot({ ...shootConfig, apicalDominance: 0 })
    expect(depthOf(bushy)).toBe(2)
  })

  it('stays under a documented ceiling even with no dominance at all', () => {
    // 464 organs for this configuration: all nine nodes branch, each branch
    // has six nodes, and five of those branch again. That is a bush, which is
    // what zero apical dominance should mean. The ceiling exists to catch a
    // change that makes it millions rather than hundreds.
    const count = (shoot: Shoot): number =>
      shoot.internodes.length +
      shoot.leaves.length +
      shoot.branches.reduce((sum, b) => sum + count(b.shoot), 0)
    const bushy = buildShoot({ ...shootConfig, apicalDominance: 0 })
    expect(count(bushy)).toBe(464)
    expect(count(bushy)).toBeLessThan(1000)
  })

  it('produces far fewer organs with realistic dominance, which is the point', () => {
    const count = (shoot: Shoot): number =>
      shoot.internodes.length +
      shoot.leaves.length +
      shoot.branches.reduce((sum, b) => sum + count(b.shoot), 0)
    const realistic = buildShoot({ ...shootConfig, apicalDominance: 0.6 })
    const bushy = buildShoot({ ...shootConfig, apicalDominance: 0 })
    expect(count(realistic)).toBeLessThan(count(bushy) / 2)
  })

  it('handles zero nodes', () => {
    const empty = buildShoot({ ...shootConfig, nodes: 0 })
    expect(empty.internodes).toEqual([])
    expect(empty.branches).toEqual([])
  })
})

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
