import { describe, expect, it } from 'vitest'
import { makeOrgan } from '../../src/dev/structure.ts'
import { buildShoot, growPhytomers, shouldBranch } from '../../src/dev/meristem.ts'
import { grow } from '../../src/dev/grow.ts'
import { placeOrgans, projectOrgans } from '../../src/dev/layout.ts'
import { DANDELION } from '../../src/species.ts'
import type { PhytomerConfig, Shoot, ShootConfig } from '../../src/dev/meristem.ts'

describe('growPhytomers', () => {
  const config: PhytomerConfig = {
    nodes: 8,
    pattern: 'spiral',
    internodeLength: 10,
    leafLength: 6,
    leafWidth: 2,
    divergenceDeg: 55,
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
    divergenceDeg: 55,
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

describe('grow dispatches on growth form', () => {
  const erect = {
    discrete: {
      'habit.growth_form': {
        expressed: ['erect'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
    },
    quantitative: {},
  }
  const rosette = {
    discrete: {
      'habit.growth_form': {
        expressed: ['rosette'],
        winner: 1,
        blended: false,
        secondaryWeight: 0,
      },
    },
    quantitative: {},
  }

  it('implements two genuinely different loops, not one with a flag', () => {
    const erectShoot = grow(erect, DANDELION, 'form')
    const rosetteShoot = grow(rosette, DANDELION, 'form')
    // A rosette has one internode, the crown, and no branches.
    expect(rosetteShoot.internodes.length).toBe(1)
    expect(rosetteShoot.branches.length).toBe(0)
    expect(erectShoot.internodes.length).toBeGreaterThan(1)
  })

  it('puts every rosette leaf at the crown, at one height', () => {
    const shoot = grow(rosette, DANDELION, 'form')
    const heights = new Set(shoot.leaves.map((leaf) => leaf.transform.y.toFixed(6)))
    expect(heights.size).toBe(1)
    expect(shoot.leaves.length).toBeGreaterThan(4)
  })

  it('makes a rosette low and wide and an erect shoot tall and narrow', () => {
    // The botanical claim, measured on the plant rather than on a leaf angle.
    // A rosette's leaves leave the crown steeply and then ARCH outward, so the
    // base angle is not what makes it flat; the spread is.
    const shape = (phenotype: typeof erect): { width: number; height: number } => {
      const organs = projectOrgans(placeOrgans(grow(phenotype, DANDELION, 'form')), 0)
      let minX = 0
      let maxX = 0
      let maxY = 0
      for (const organ of organs) {
        const radians = (organ.angle * Math.PI) / 180
        const drawn = organ.length * organ.scale
        const tipX = organ.x + drawn * Math.sin(radians)
        const tipY = organ.y + drawn * Math.cos(radians)
        minX = Math.min(minX, tipX)
        maxX = Math.max(maxX, tipX)
        maxY = Math.max(maxY, tipY)
      }
      return { width: maxX - minX, height: maxY }
    }

    const rosetteShape = shape(rosette)
    const erectShape = shape(erect)
    expect(rosetteShape.width / rosetteShape.height).toBeGreaterThan(
      erectShape.width / erectShape.height,
    )
  })

  it('is deterministic', () => {
    expect(grow(rosette, DANDELION, 'form')).toEqual(grow(rosette, DANDELION, 'form'))
  })

  it('falls back to erect when the habit is absent', () => {
    const bare = { discrete: {}, quantitative: {} }
    expect(grow(bare, DANDELION, 'form').internodes.length).toBeGreaterThan(1)
  })
})
