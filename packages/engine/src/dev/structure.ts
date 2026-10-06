/**
 * The organ tree: what a plant *is*, before anything draws it.
 *
 * Geometry, colour and time are not here. This is the shape a simulation
 * produces and a renderer consumes.
 */

/** What an organ is. Identity comes from the ABC model, in identity.ts. */
export type OrganKind =
  | 'root'
  | 'stem'
  | 'internode'
  | 'petiole'
  | 'leaf'
  | 'thorn'
  | 'bud'
  | 'flower'
  | 'sepal'
  | 'petal'
  | 'stamen'
  | 'carpel'

export interface Transform {
  readonly x: number
  readonly y: number
  /** Degrees, anticlockwise from vertical. */
  readonly angle: number
  readonly scale: number
  /**
   * The z component of the organ's unit direction: positive toward the viewer.
   *
   * Needed because the projected angle and scale alone determine a direction
   * only up to the sign of its depth, and guessing the sign would make half a
   * rosette face the viewer. The growth loop knows it, so it records it.
   */
  readonly depth?: number
  /**
   * How far from the stem axis this organ attaches, along its own azimuth.
   *
   * Zero for a leaf on an upright stem. A rosette needs it, because its leaves
   * attach around the circumference of a compressed crown rather than all at one
   * point, and leaves sharing a single point can only ever overlap.
   */
  readonly radial?: number
}

export interface Organ {
  readonly kind: OrganKind
  readonly transform: Transform
  /** Length along the organ's own axis. */
  readonly length: number
  /** Width across the organ's own axis. */
  readonly width: number
  readonly children: readonly Organ[]
}

/** A whole plant, plus the totals the allometry checks and the gate need. */
export interface Structure {
  readonly root: Organ
  readonly organCount: number
  readonly height: number
  readonly leafArea: number
  /**
   * The phenology stage name. Typed as a string rather than the `Stage` union
   * deliberately: `structure.ts` must not depend on `phenology.ts`, or the two
   * modules end up importing each other.
   */
  readonly stage: string
  /** Allometric plausibility, zero to one. See allometry.ts. */
  readonly plausibilityScore: number
}

export function makeOrgan(
  kind: OrganKind,
  transform: Transform,
  length: number,
  width: number,
  children: readonly Organ[] = [],
): Organ {
  return { kind, transform, length, width, children: [...children] }
}

/** Depth-first, children in order, so the walk is deterministic. */
export function flatten(organ: Organ): readonly Organ[] {
  const out: Organ[] = [organ]
  for (const child of organ.children) out.push(...flatten(child))
  return out
}

export function countOrgans(organ: Organ): number {
  return flatten(organ).length
}

/**
 * The highest y in the tree.
 *
 * A maximum rather than a sum: organs are already positioned in absolute
 * coordinates by whoever built them, so adding their lengths would double-count.
 */
export function heightOf(organ: Organ): number {
  let max = organ.transform.y
  for (const child of organ.children) {
    const childHeight = heightOf(child)
    if (childHeight > max) max = childHeight
  }
  return max
}

/**
 * Total leaf area, approximated as length times width.
 *
 * Enough for the pipe model in allometry.ts, which needs a quantity
 * proportional to real leaf area rather than an accurate one.
 */
export function leafAreaOf(organ: Organ): number {
  let area = 0
  for (const candidate of flatten(organ)) {
    if (candidate.kind === 'leaf') area += candidate.length * candidate.width
  }
  return area
}

/**
 * Derive a `Structure` from a root, so the totals are always consistent with
 * the tree they describe rather than passed in and drifting.
 */
export function describeStructure(
  root: Organ,
  stage: string,
  plausibilityScore: number,
): Structure {
  return {
    root,
    organCount: countOrgans(root),
    height: heightOf(root),
    leafArea: leafAreaOf(root),
    stage,
    plausibilityScore,
  }
}
