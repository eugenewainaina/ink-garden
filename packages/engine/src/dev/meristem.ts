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
