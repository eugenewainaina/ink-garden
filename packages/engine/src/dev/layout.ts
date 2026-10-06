import type { Organ } from './structure.ts'
import type { Shoot } from './meristem.ts'
import {
  UP,
  leanInPicture,
  projectDir,
  projectPoint,
  type Vec3,
} from './phyllotaxis.ts'

/**
 * How far the camera looks down.
 *
 * Zero is a flat side elevation, which is what the silhouette used and what the
 * placement tests still assume. The drawing uses a tilt, because a rosette seen
 * edge-on is a squashed mound: its leaves lie nearly flat, so in strict
 * elevation they overlap into an illegible mass. Tilting opens the ground plane
 * up and gives every plant visible depth, which is the view botanical
 * illustrators use and for the same reason.
 */
export const DEFAULT_TILT_DEG = 26

const DEG_TO_RAD = Math.PI / 180

/**
 * An organ placed in absolute plant coordinates.
 *
 * This is the ONE placement path. The silhouette dump and the geometry stage
 * both derive from it, so there is no second walk that could drift from this
 * one. A `Segment` is one reduction of it, not a parallel model.
 */
export interface PlacedOrgan {
  readonly kind: Organ['kind']
  /** Base of the organ, in three dimensions. */
  readonly position: Vec3
  /** Unit direction the organ grows in, in three dimensions. */
  readonly direction: Vec3
  readonly length: number
  readonly width: number
}

/** A placed organ after projection: what a renderer actually needs. */
export interface ProjectedOrgan {
  readonly kind: Organ['kind']
  readonly x: number
  readonly y: number
  /** Depth toward the viewer, kept so a light model can shade by it. */
  readonly depth: number
  /** In-plane angle from vertical, anticlockwise, degrees. */
  readonly angle: number
  /** Foreshortening: how much of the organ's length survives the projection. */
  readonly scale: number
  readonly length: number
  readonly width: number
  /**
   * How much the organ faces the viewer, 0 edge-on and 1 square on.
   *
   * A lamina seen edge-on should be drawn as a line, not a leaf; without this a
   * rosette's leaves all look equally broad however they are turned.
   */
  readonly facing: number
}

/**
 * Project placements for a given camera tilt.
 *
 * `facing` is how broad the organ looks. A lamina is a flat surface, so one
 * turned edge-on should be drawn as a narrow sliver rather than a full leaf.
 * Without it a rosette is an illegible mass, because a dozen leaves at
 * different angles all come out the same width.
 */
export function projectOrgans(
  organs: readonly PlacedOrgan[],
  tiltDeg = DEFAULT_TILT_DEG,
): readonly ProjectedOrgan[] {
  const tilt = tiltDeg * DEG_TO_RAD
  return organs.map((organ) => {
    const point = projectPoint(organ.position, tiltDeg)
    const { angle, scale } = projectDir(organ.direction, tiltDeg)

    // The lamina's width lies along the horizontal perpendicular to the leaf's
    // radial direction. Recover the azimuth from the direction, then project
    // that perpendicular to see how much of the width survives.
    const azimuth = Math.atan2(organ.direction.z, organ.direction.x)
    const facing = Math.hypot(Math.sin(azimuth), Math.cos(azimuth) * Math.sin(tilt))

    return {
      kind: organ.kind,
      x: point.x,
      y: point.y,
      depth: organ.position.z,
      angle,
      scale,
      length: organ.length,
      width: organ.width,
      facing: Math.max(0.45, Math.min(1, facing)),
    }
  })
}

export interface Segment {
  readonly kind: Organ['kind']
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly width: number
}

/**
 * Walk a shoot into absolute organ placements, composing transforms through
 * the parent chain.
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
export function placeOrgans(
  shoot: Shoot,
  originX = 0,
  originY = 0,
  baseAngle = 0,
): readonly PlacedOrgan[] {
  const out: PlacedOrgan[] = []
  walkShoot(shoot, { x: originX, y: originY, z: 0 }, baseAngle, out)
  return out
}

/**
 * Reduce placed organs to centre lines, for a silhouette.
 *
 * A derivation rather than a second placement path: it consumes what
 * `placeOrgans` produced and throws away everything except the axis.
 */
export function layoutShoot(
  shoot: Shoot,
  originX = 0,
  originY = 0,
  baseAngle = 0,
  tiltDeg = 0,
): readonly Segment[] {
  return projectOrgans(placeOrgans(shoot, originX, originY, baseAngle), tiltDeg).map(
    (organ) => {
      const radians = organ.angle * DEG_TO_RAD
      const drawn = organ.length * organ.scale
      return {
        kind: organ.kind,
        x1: organ.x,
        y1: organ.y,
        x2: organ.x + drawn * Math.sin(radians),
        y2: organ.y + drawn * Math.cos(radians),
        width: organ.width,
      }
    },
  )
}

function directionFromTransform(transform: {
  readonly angle: number
  readonly scale: number
  readonly depth?: number
}): Vec3 {
  const radians = transform.angle * DEG_TO_RAD
  return {
    x: Math.sin(radians) * transform.scale,
    y: Math.cos(radians) * transform.scale,
    z: transform.depth ?? 0,
  }
}

function walkShoot(
  shoot: Shoot,
  start: Vec3,
  baseAngle: number,
  out: PlacedOrgan[],
): void {
  let position = start
  let angle = baseAngle

  // Where each node ended up, so a leaf or a branch can attach to it.
  const nodes: Vec3[] = []
  const alongByNode: number[] = []
  let along = 0

  for (const internode of shoot.internodes) {
    const here = angle + internode.transform.angle
    const direction = leanInPicture(UP, here)
    const next: Vec3 = {
      x: position.x + internode.length * direction.x,
      y: position.y + internode.length * direction.y,
      z: position.z + internode.length * direction.z,
    }
    out.push({
      kind: 'internode',
      position,
      direction,
      length: internode.length,
      width: internode.width,
    })
    position = next
    angle = here
    along += internode.length
    nodes.push(position)
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
    const local = directionFromTransform(leaf.transform)
    const radial = leaf.transform.radial ?? 0
    const azimuth = Math.atan2(local.z, local.x)
    out.push({
      kind: 'leaf',
      position: {
        x: stem.x + radial * Math.cos(azimuth),
        y: stem.y,
        z: stem.z + radial * Math.sin(azimuth),
      },
      direction: leanInPicture(local, angle),
      length: leaf.length,
      width: leaf.width,
    })
  }

  for (const flower of shoot.flowers) {
    const node = nodeFromAlong(flower.transform.y)
    const stem = nodes[node]
    if (stem === undefined) continue
    // A flower faces outward from the axis, and its own angle is not a
    // phyllotaxis azimuth, so it keeps the shoot's lean and nothing more.
    out.push({
      kind: 'flower',
      position: stem,
      direction: leanInPicture(UP, angle),
      length: flower.length,
      width: flower.width,
    })
  }

  for (const branch of shoot.branches) {
    const stem = nodes[branch.node]
    if (stem === undefined) continue
    walkShoot(branch.shoot, stem, angle + branch.angle, out)
  }
}
