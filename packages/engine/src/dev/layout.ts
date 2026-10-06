import type { Organ } from './structure.ts'
import type { Shoot } from './meristem.ts'

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
  /** Base of the organ: where it attaches. */
  readonly x: number
  readonly y: number
  /** In-plane angle from vertical, anticlockwise, degrees. */
  readonly angle: number
  /** Foreshortening from projecting a 3D organ onto the picture plane. */
  readonly scale: number
  readonly length: number
  readonly width: number
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
  walkShoot(shoot, originX, originY, baseAngle, out)
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
): readonly Segment[] {
  return placeOrgans(shoot, originX, originY, baseAngle).map((organ) => {
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
  })
}

function walkShoot(
  shoot: Shoot,
  originX: number,
  originY: number,
  baseAngle: number,
  out: PlacedOrgan[],
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
      x,
      y,
      angle: here,
      scale: 1,
      length: internode.length,
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
    out.push({
      kind: 'leaf',
      x: stem.x,
      y: stem.y,
      angle: angle + leaf.transform.angle,
      scale: leaf.transform.scale,
      length: leaf.length,
      width: leaf.width,
    })
  }

  for (const branch of shoot.branches) {
    const stem = nodes[branch.node]
    if (stem === undefined) continue
    walkShoot(branch.shoot, stem.x, stem.y, angle + branch.angle, out)
  }
}
