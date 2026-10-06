import type { Organ } from './structure.ts'
import type { Shoot } from './meristem.ts'

const DEG_TO_RAD = Math.PI / 180

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
