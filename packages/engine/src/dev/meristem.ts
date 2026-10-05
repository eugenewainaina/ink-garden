import { rngFrom } from '../rng.ts'
import { makeOrgan, type Organ } from './structure.ts'

const DEG_TO_RAD = Math.PI / 180

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

/**
 * The azimuth of the first leaf at a node: its rotation *around* the stem, in
 * degrees.
 *
 * This is emphatically not the angle a renderer draws the leaf at. An azimuth
 * is a rotation around an axis; a drawing needs a direction in the picture
 * plane. Confusing the two put every leaf collinear with the stem, because
 * alternate phyllotaxis gives azimuths of 0 and 180, and a leaf drawn at 0
 * degrees from vertical points straight up the stem. Use `projectLeaf` for
 * drawing.
 */
export function nextBudAngle(pattern: Phyllotaxis, nodeIndex: number): number {
  const raw = nodeIndex * phyllotaxisAngle(pattern)
  return ((raw % 360) + 360) % 360
}

/** How far a leaf stands out from the stem, in degrees. */
export const LEAF_DIVERGENCE_DEG = 55

/**
 * Project a leaf's position around the stem onto the picture plane.
 *
 * A leaf attaches at `divergence` degrees from the stem axis and points in the
 * radial direction given by its azimuth. Viewed from the side, that direction
 * has an in-plane component `sin(divergence) * cos(azimuth)` horizontally and
 * `cos(divergence)` vertically, so:
 *
 *   - a leaf at azimuth 0 points clear of the stem and is drawn full length
 *   - a leaf at azimuth 180 points the other way, giving the ladder an
 *     alternate-leaved plant actually has
 *   - a leaf at azimuth 90 points at the viewer, foreshortens to `cos(divergence)`
 *     of its length, and is drawn nearly parallel to the stem
 *
 * The foreshortening is returned as a scale rather than baked into the length,
 * so the organ keeps its true size and only its projection is shortened.
 */
export function projectLeaf(
  azimuthDeg: number,
  divergenceDeg = LEAF_DIVERGENCE_DEG,
): { readonly angle: number; readonly scale: number } {
  const azimuth = azimuthDeg * DEG_TO_RAD
  const divergence = divergenceDeg * DEG_TO_RAD
  const dx = Math.sin(divergence) * Math.cos(azimuth)
  const dy = Math.cos(divergence)
  return {
    angle: Math.atan2(dx, dy) / DEG_TO_RAD,
    scale: Math.hypot(dx, dy),
  }
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
      const azimuth = nextBudAngle(config.pattern, node) + (i * 360) / perNode
      const leafR = rngFrom(`leaf|${config.seed}|${node}|${i}`)
      const leafLength = config.leafLength * (0.8 + leafR() * 0.4)
      // Divergence varies a little per leaf, because a plant whose leaves all
      // leave at exactly the same angle reads as a diagram.
      const divergence = LEAF_DIVERGENCE_DEG * (0.8 + leafR() * 0.4)
      const projected = projectLeaf(azimuth, divergence)
      leaves.push(
        makeOrgan(
          'leaf',
          {
            x: 0,
            y: heightSoFar,
            angle: projected.angle,
            scale: projected.scale,
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

/** A line from one point to another, in absolute plant coordinates, y upward. */
export interface Segment {
  readonly kind: Organ['kind']
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly width: number
}

/**
 * Flatten a shoot into absolute line segments, composing transforms through the
 * parent chain.
 *
 * The plan's first draft offset a branch sideways without rotating it, which is
 * enough to place organs but useless for looking at, because whether branches
 * *lean* is exactly the question a silhouette answers. This composes properly
 * instead: an angle is measured from vertical, anticlockwise, and each child's
 * angle is relative to its parent's.
 *
 * `y` grows upward, as a plant does. A renderer flips it, because SVG and
 * canvas grow downward.
 */
export function layoutShoot(
  shoot: Shoot,
  originX = 0,
  originY = 0,
  baseAngle = 0,
): readonly Segment[] {
  const out: Segment[] = []
  walkShoot(shoot, originX, originY, baseAngle, out)
  return out
}

function walkShoot(
  shoot: Shoot,
  originX: number,
  originY: number,
  baseAngle: number,
  out: Segment[],
): void {
  let x = originX
  let y = originY
  let angle = baseAngle

  // The absolute position of each node, recorded as the axis is walked. Exact
  // even if the axis bends, which it does not yet but will.
  const nodes: { x: number; y: number }[] = []
  // A leaf's own y is the distance along the axis at its node, recorded when
  // the phytomer was built, so it identifies its node exactly.
  const alongByNode: number[] = []
  let along = 0

  for (const internode of shoot.internodes) {
    const here = angle + internode.transform.angle
    const radians = here * DEG_TO_RAD
    const nextX = x + internode.length * Math.sin(radians)
    const nextY = y + internode.length * Math.cos(radians)
    out.push({
      kind: 'internode',
      x1: x,
      y1: y,
      x2: nextX,
      y2: nextY,
      width: internode.width,
    })
    x = nextX
    y = nextY
    angle = here
    along += internode.length
    nodes.push({ x, y })
    alongByNode.push(along)
  }

  const nodeFromAlong = (height: number): number => {
    for (let i = 0; i < alongByNode.length; i += 1) {
      if (Math.abs((alongByNode[i] ?? 0) - height) < 1e-9) return i
    }
    return -1
  }

  for (const leaf of shoot.leaves) {
    const node = nodeFromAlong(leaf.transform.y)
    const stem = nodes[node]
    if (stem === undefined) continue
    const radians = (angle + leaf.transform.angle) * DEG_TO_RAD
    // A projected leaf is shorter than it is, which is what `scale` carries.
    const drawn = leaf.length * leaf.transform.scale
    out.push({
      kind: 'leaf',
      x1: stem.x,
      y1: stem.y,
      x2: stem.x + drawn * Math.sin(radians),
      y2: stem.y + drawn * Math.cos(radians),
      width: leaf.width,
    })
  }

  for (const branch of shoot.branches) {
    const stem = nodes[branch.node]
    if (stem === undefined) continue
    walkShoot(branch.shoot, stem.x, stem.y, angle + branch.angle, out)
  }
}
