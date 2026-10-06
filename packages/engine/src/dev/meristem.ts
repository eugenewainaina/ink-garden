import { rngFrom } from '../rng.ts'
import { makeOrgan, type Organ } from './structure.ts'
import {
  leavesPerNode,
  nextBudAngle,
  leafDirection3,
  projectDir,
  type Phyllotaxis,
} from './phyllotaxis.ts'

export interface PhytomerConfig {
  readonly nodes: number
  readonly pattern: Phyllotaxis
  readonly internodeLength: number
  readonly leafLength: number
  readonly leafWidth: number
  /** How far a leaf stands out from the stem, in degrees. */
  readonly divergenceDeg: number
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
      const azimuth = nextBudAngle(config.pattern, node) + (i * 360) / perNode
      const leafR = rngFrom(`leaf|${config.seed}|${node}|${i}`)
      const leafLength = config.leafLength * (0.8 + leafR() * 0.4)
      // Divergence varies a little per leaf, because a plant whose leaves all
      // leave at exactly the same angle reads as a diagram.
      const divergence = config.divergenceDeg * (0.8 + leafR() * 0.4)
      const direction = leafDirection3(azimuth, divergence)
      const projected = projectDir(direction, 0)
      leaves.push(
        makeOrgan(
          'leaf',
          {
            x: 0,
            y: heightSoFar,
            angle: projected.angle,
            scale: projected.scale,
            depth: direction.z,
          },
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
  readonly divergenceDeg: number
  /** Which inflorescence to build, from the phenotype. */
  readonly inflorescence: string
  /** How wide one flower or head is, in centimetres. */
  readonly flowerSize: number
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
  /**
   * Flowers, placed like leaves: a flower's `transform.y` names the node it
   * sits on. A separate list rather than a kind of leaf, because a flower is
   * not an appendage of the same order and the inflorescence decides how many
   * there are and where.
   */
  readonly flowers: readonly Organ[]
  readonly branches: readonly Branch[]
}

/**
 * One order of branching.
 *
 * A young plant is a main axis with branches off it, and that is what this
 * builds. Two orders was tried and is wrong at this scale for a reason worth
 * recording: with twenty nodes and fifty-six percent of buds growing out, the
 * first order gives eleven branches and the second gives ninety-four, which
 * took a rosemary seedling to 1182 leaves. A mature shrub does carry that many,
 * but it gets them over years, and this engine is drawing a young plant. Depth
 * rises when growth over time arrives in M1, not before.
 */
const MAX_BRANCH_DEPTH = 1

/**
 * Where flowers sit on a shoot, as node indices.
 *
 * One rule per inflorescence, from the floras. A HEAD is terminal and solitary,
 * which is why a dandelion has one scape and one capitulum. A PANICLE is a
 * branched terminal cluster. A SPIKE carries whorls up the top of the stem,
 * which is what a mint does with its verticillasters. A CYME is a small cluster
 * in the upper axils, which is rosemary.
 */
export function flowerNodes(
  inflorescence: string,
  nodes: number,
): readonly { readonly node: number; readonly azimuth: number }[] {
  if (nodes <= 0) return []
  const last = nodes - 1
  const whorl = (node: number, count: number): { node: number; azimuth: number }[] =>
    Array.from({ length: count }, (_, i) => ({ node, azimuth: (i * 360) / count }))

  switch (inflorescence) {
    case 'head':
    case 'solitary':
      return [{ node: last, azimuth: 0 }]
    case 'panicle':
    case 'corymb': {
      // A branched terminal cluster: a few nodes each carrying a small group.
      const out: { node: number; azimuth: number }[] = []
      for (const node of [last, last - 1, last - 2]) {
        if (node >= 0) out.push(...whorl(node, 3))
      }
      return out
    }
    case 'spike':
    case 'raceme': {
      // A VERTICILLASTER is a whorl of flowers at a node, and a mint's spike is
      // a column of them. One flower per node is not a verticillaster and does
      // not read as one, which is why the first attempt drew nothing visible.
      const from = Math.max(0, Math.floor(nodes * 0.55))
      const out: { node: number; azimuth: number }[] = []
      for (let node = from; node <= last; node += 1) out.push(...whorl(node, 4))
      return out
    }
    case 'cyme':
    case 'umbel': {
      // Clusters of two or three in the upper axils, which is rosemary.
      const out: { node: number; azimuth: number }[] = []
      for (let node = Math.max(0, last - 2); node <= last; node += 1) {
        out.push(...whorl(node, 3))
      }
      return out
    }
    default:
      return [{ node: last, azimuth: 0 }]
  }
}

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
    divergenceDeg: config.divergenceDeg,
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
            nodes: Math.max(2, Math.round(config.nodes * 0.45)),
            apicalDominance: Math.min(1, config.apicalDominance + 0.15),
            seed: `${config.seed}|b${depth}|${node}`,
          },
          depth + 1,
        ),
      })
    }
  }

  // Flowers go on the same nodes the leaves do, at the height the phytomer
  // recorded, so one placement path still serves everything.
  const flowers: Organ[] = []
  const nodeHeights = new Map<number, number>()
  {
    let height = 0
    for (let i = 0; i < phytomers.internodes.length; i += 1) {
      const internode = phytomers.internodes[i]
      height += internode?.length ?? 0
      nodeHeights.set(i, height)
    }
  }
  for (const spot of flowerNodes(config.inflorescence, config.nodes)) {
    const y = nodeHeights.get(spot.node)
    if (y === undefined) continue
    // A flower faces outward like a leaf, so a whorl of them spreads around the
    // stem and reads as a whorl from a tilted view rather than as one flower.
    const direction = leafDirection3(spot.azimuth, 70)
    const projected = projectDir(direction, 0)
    flowers.push(
      makeOrgan(
        'flower',
        {
          x: 0,
          y,
          angle: projected.angle,
          scale: projected.scale,
          depth: direction.z,
        },
        config.flowerSize,
        config.flowerSize,
      ),
    )
  }

  return { internodes: phytomers.internodes, leaves: phytomers.leaves, flowers, branches }
}

/** A line from one point to another, in absolute plant coordinates, y upward. */
