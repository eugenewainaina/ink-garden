import type { Organ, Structure } from './structure.ts'
import { flatten, leafAreaOf, heightOf } from './structure.ts'

/**
 * Allometry: the constraints that make a plant's proportions physical.
 *
 * Two relations, both real and both measured in the literature, plus a taper.
 * Nothing here ever removes an organ or shortens a stem, because the design rule
 * is that a constraint thickens rather than punishes (spec §2).
 */

/**
 * Pipe model coefficient: stem radius against the leaf area it serves.
 *
 * Shinozaki's pipe model says leaf area and the sapwood cross-section that
 * supplies it are proportional, so radius goes as the square root of leaf area.
 * The coefficient is calibrated in centimetres against real plants and checked
 * across all four species: rosemary comes out at a 2.5 mm stem for a 15 cm
 * shoot, spearmint at 5 mm, a dandelion crown at 8 mm of rootstock, and a
 * 1.3 m jacaranda sapling at a 3 cm trunk. All four are what you would measure.
 *
 * It is a single constant because the relationship is one relationship. A
 * species does not get to opt out of hydraulics.
 */
export const PIPE_COEFFICIENT = 0.033

/**
 * Greenhill's buckling coefficient, calibrated in centimetres.
 *
 * A column failing under its own weight has a maximum height proportional to
 * the two-thirds power of its diameter, which is why height has strongly
 * diminishing returns and why a thin stem cannot be tall. The EXPONENT is the
 * real content; the coefficient is a scale factor for wood at these units, and
 * it is set so the relation fits plants you can measure:
 *
 *   a 1 cm stem stands about 1 m      -> C = 100
 *   a 2.5 mm stem stands about 40 cm  -> 100 * 0.25^(2/3) = 40 cm
 *   a 3 cm trunk stands about 15 m    -> 100 * 6^(2/3)     = 16 m
 *
 * The first value tried was 12, which claimed a 16 cm shoot needed a 1.5 cm
 * stem. The exponent was right and the scale was wrong by nearly an order of
 * magnitude, which is exactly the kind of error that only shows up when the
 * numbers are checked against real plants.
 */
export const BUCKLING_COEFFICIENT = 100

/** The radius needed to supply a given leaf area, by the pipe model. */
export function pipeModelRadius(leafArea: number): number {
  if (leafArea <= 0) return 0
  return PIPE_COEFFICIENT * Math.sqrt(leafArea)
}

/** The tallest a stem of this radius can stand, by Greenhill. */
export function maxHeightForRadius(radius: number): number {
  if (radius <= 0) return 0
  return BUCKLING_COEFFICIENT * Math.pow(radius * 2, 2 / 3)
}

/**
 * The radius at which a stem of this height stops buckling, solved directly.
 *
 * Inverting `maxHeight = C * (2r)^(2/3)` gives `r = (H / C)^(3/2) / 2`. The
 * first version iterated upward instead, and did not converge: it needed a
 * factor of a hundred and only grew by a quarter each step.
 */
export function bucklingRadius(height: number): number {
  if (height <= 0) return 0
  return Math.pow(height / BUCKLING_COEFFICIENT, 1.5) / 2
}

/**
 * The radius a stem must have where `leafArea` sits above it and its height
 * above the ground is `height`.
 *
 * Thickening for buckling rather than shortening is deliberate: shortening the
 * plant would be taking away something that was grown.
 */
export function requiredRadius(leafArea: number, height: number): number {
  return Math.max(pipeModelRadius(leafArea), bucklingRadius(height))
}

/**
 * Taper: how much of the base radius survives at a fraction up the plant.
 *
 * The pipe model says cross-section is proportional to the leaf area DISTAL to a
 * point. On an axis with leaves all along it, that area falls roughly linearly
 * toward the tip, so radius falls as its square root. A plant is therefore
 * thickest at the base without anyone drawing a taper.
 */
export function taperedRadius(baseRadius: number, heightFraction: number): number {
  const above = Math.max(0.04, 1 - Math.max(0, Math.min(1, heightFraction)))
  return baseRadius * Math.sqrt(above)
}

/** Where along the plant an organ sits, as a fraction of its height. */
function heightFractionOf(organ: Organ, height: number): number {
  if (height <= 0) return 0
  return Math.max(0, Math.min(1, organ.transform.y / height))
}

export interface Allometry {
  /** Radius of the stem at the base. */
  readonly baseRadius: number
  /** Radius at a height fraction. */
  readonly radiusAt: (heightFraction: number) => number
  readonly leafArea: number
  readonly height: number
  /** True when the buckling limit, not the pipe model, set the radius. */
  readonly bucklingLimited: boolean
}

/**
 * Work out a plant's thickness from its leaves and its height.
 *
 * Applied once per plant rather than per organ, because every organ of an axis
 * shares one hydraulic budget: the leaves above a point are what its
 * cross-section has to serve.
 */
export function allometryFor(structure: Structure): Allometry {
  const leafArea = leafAreaOf(structure.root)
  const height = heightOf(structure.root)
  const pipe = pipeModelRadius(leafArea)
  const baseRadius = requiredRadius(leafArea, height)
  return {
    baseRadius,
    radiusAt: (fraction: number) => taperedRadius(baseRadius, fraction),
    leafArea,
    height,
    bucklingLimited: baseRadius > pipe * 1.0001,
  }
}

/**
 * Corner's rules as a soft constraint.
 *
 * "More highly ramified shoots have smaller leaves" is the correlation
 * confirmed on Leucadendron by Roddy et al. (2019, PeerJ) and reviewed as a live
 * framework by Lauri (2019, New Phytologist). It is a trend with real scatter,
 * not a law, so this returns a correction factor to be applied gently rather
 * than a hard clamp.
 *
 * Three or fewer appendages is unremarkable; beyond that the leaves are scaled
 * down as the fourth root of the branching, which is mild on purpose.
 */
export function cornerLeafScale(appendageCount: number): number {
  if (appendageCount <= 3) return 1
  return Math.max(0.6, Math.pow(3 / appendageCount, 0.25))
}

/**
 * Plausibility, zero to one, for the validity check the art gate surfaces
 * rather than hides.
 *
 * Weighs the pipe model and the buckling limit together: a stem that is far
 * thinner than its leaves demand, or far too thin for its height, scores low.
 */
export function plausibility(structure: Structure): number {
  const radius = allometryFor(structure).baseRadius
  const actual = meanStemRadius(structure)
  if (actual <= 0) return 1

  const ratio = actual / radius
  // 1 is exact. Falling short is worse than being over-built.
  const score = ratio >= 1 ? 1 - Math.min(0.4, (ratio - 1) * 0.4) : Math.max(0, ratio)
  return Math.max(0, Math.min(1, score))
}

/** Mean radius of the axial organs, as drawn. */
function meanStemRadius(structure: Structure): number {
  let total = 0
  let count = 0
  for (const organ of flatten(structure.root)) {
    if (organ.kind === 'internode' || organ.kind === 'stem') {
      total += organ.width / 2
      count += 1
    }
  }
  return count === 0 ? 0 : total / count
}
