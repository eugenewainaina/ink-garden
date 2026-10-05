import { rngFrom } from '../rng.ts'
import { makeOrgan, type Organ } from './structure.ts'

/**
 * How successive leaves are arranged around the stem.
 *
 * This is the single highest-payoff rule in the whole simulation. Get
 * phyllotaxis right and a plant reads as a plant in silhouette, before any
 * geometry exists.
 */
export type Phyllotaxis = 'alternate' | 'decussate' | 'whorled' | 'spiral'

/** The golden angle, 360 * (1 - 1/phi). The reason plants look like plants. */
export const GOLDEN_ANGLE = 360 * (1 - 1 / ((1 + Math.sqrt(5)) / 2))

export function phyllotaxisAngle(pattern: Phyllotaxis): number {
  switch (pattern) {
    case 'alternate':
      return 180
    case 'decussate':
      return 90
    case 'whorled':
      return 120
    case 'spiral':
    default:
      return GOLDEN_ANGLE
  }
}

/** How many leaves emerge at each node. */
export function leavesPerNode(pattern: Phyllotaxis): number {
  switch (pattern) {
    case 'decussate':
      return 2
    case 'whorled':
      return 3
    default:
      return 1
  }
}

/** Angle of the first leaf at a node, in degrees from zero. */
export function nextBudAngle(pattern: Phyllotaxis, nodeIndex: number): number {
  const raw = nodeIndex * phyllotaxisAngle(pattern)
  return ((raw % 360) + 360) % 360
}

export interface PhytomerConfig {
  readonly nodes: number
  readonly pattern: Phyllotaxis
  readonly internodeLength: number
  readonly leafLength: number
  readonly leafWidth: number
  readonly seed: string
}

/** One internode and one leaf per node is a phytomer; this is a run of them. */
export interface Phytomers {
  readonly internodes: readonly Organ[]
  readonly leaves: readonly Organ[]
}

/**
 * Run a shoot apical meristem: repeatedly produce a phytomer, which is one
 * internode, one leaf, and an axillary bud that a later task may grow out
 * (spec §5.1).
 *
 * Internode length is jittered slightly per node, seeded by the plant, because
 * perfectly regular spacing reads as artificial. Leaves are placed by
 * phyllotaxis, so a spiral plant and a decussate one are visibly different in
 * silhouette without any geometry beyond a line and an angle.
 */
export function growPhytomers(config: PhytomerConfig): Phytomers {
  const internodes: Organ[] = []
  const leaves: Organ[] = []
  const r = rngFrom(`phytomer|${config.seed}`)

  let heightSoFar = 0
  for (let node = 0; node < config.nodes; node += 1) {
    const jitter = 0.85 + r() * 0.3
    const length = config.internodeLength * jitter
    internodes.push(
      makeOrgan('internode', { x: 0, y: heightSoFar, angle: 0, scale: 1 }, length, 0.1),
    )
    heightSoFar += length

    const perNode = leavesPerNode(config.pattern)
    for (let i = 0; i < perNode; i += 1) {
      const base = nextBudAngle(config.pattern, node)
      const angle = base + (i * 360) / perNode
      const leafR = rngFrom(`leaf|${config.seed}|${node}|${i}`)
      const leafLength = config.leafLength * (0.8 + leafR() * 0.4)
      leaves.push(
        makeOrgan(
          'leaf',
          { x: 0, y: heightSoFar, angle: ((angle % 360) + 360) % 360, scale: 1 },
          leafLength,
          config.leafWidth,
        ),
      )
    }
  }

  return { internodes, leaves }
}

/**
 * Whether an axillary bud grows out.
 *
 * Apical dominance is the suppression of buds by the shoot tip, which is why a
 * stem grows as one shoot rather than a bush. Modelled directly as a
 * probability of suppression rather than as a hormone, because a hormone would
 * be unobservable at this level anyway.
 */
export function shouldBranch(
  apicalDominance: number,
  nodeIndex: number,
  r: number,
): boolean {
  // The lowest node has no bud worth growing: it is the seed leaf.
  if (nodeIndex === 0) return false
  return r >= apicalDominance
}

export interface ShootConfig {
  readonly nodes: number
  readonly pattern: Phyllotaxis
  readonly internodeLength: number
  readonly leafLength: number
  readonly leafWidth: number
  readonly apicalDominance: number
  readonly branchAngle: number
  readonly seed: string
}

export interface Branch {
  /** Index of the node whose axillary bud produced this branch. */
  readonly node: number
  /** Angle from the parent axis, in degrees. Negative is one side. */
  readonly angle: number
  readonly shoot: Shoot
}

export interface Shoot {
  readonly internodes: readonly Organ[]
  readonly leaves: readonly Organ[]
  readonly branches: readonly Branch[]
}

/** Two levels of branching is already a shrub; more explodes the organ count. */
const MAX_BRANCH_DEPTH = 2

/**
 * Grow a shoot, and let some of its axillary buds become branches.
 *
 * Dominance rises with depth and the node count shrinks, both so that a plant
 * with no dominance at all produces a shrub rather than thousands of organs.
 */
export function buildShoot(config: ShootConfig, depth = 0): Shoot {
  const phytomers = growPhytomers({
    nodes: config.nodes,
    pattern: config.pattern,
    internodeLength: config.internodeLength,
    leafLength: config.leafLength,
    leafWidth: config.leafWidth,
    seed: config.seed,
  })

  const branches: Branch[] = []
  if (depth < MAX_BRANCH_DEPTH) {
    for (let node = 1; node < config.nodes; node += 1) {
      const r = rngFrom(`branch|${config.seed}|${depth}|${node}`)()
      if (!shouldBranch(config.apicalDominance, node, r)) continue
      const side = rngFrom(`side|${config.seed}|${depth}|${node}`)() < 0.5 ? -1 : 1
      branches.push({
        node,
        angle: side * config.branchAngle,
        shoot: buildShoot(
          {
            ...config,
            nodes: Math.max(2, Math.round(config.nodes * 0.6)),
            apicalDominance: Math.min(1, config.apicalDominance + 0.15),
            seed: `${config.seed}|b${depth}|${node}`,
          },
          depth + 1,
        ),
      })
    }
  }

  return { internodes: phytomers.internodes, leaves: phytomers.leaves, branches }
}
