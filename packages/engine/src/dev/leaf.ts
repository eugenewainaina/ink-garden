import { rngFrom } from '../rng.ts'

/**
 * Lamina geometry: the shape of a leaf blade.
 *
 * One function draws every leaf. A blade is a *profile* — half-width as a
 * fraction of the distance from base to apex — and the descriptive botanical
 * terms are selectors over that profile rather than separate drawings.
 *
 * The two-layer decomposition is not invented. A botanical key states it
 * directly: "when leaves are deeply toothed or lobed, leaf shape is
 * approximated by a line drawn about the apices of each tooth or lobe". So the
 * outline is the line about the lobe tips, and the margin is a separate
 * modulation of it.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

/**
 * What the profile function needs: where the widest point is, and how broad the
 * shoulders are.
 *
 * Kept separate from `LeafShape` so `laminaProfile` cannot demand an `aspect`
 * it does not use. A caller that only wants a profile should not have to invent
 * a width for it.
 */
export interface ProfileShape {
  /** Position of the widest point along the blade, 0 at base and 1 at apex. */
  readonly mode: number
  /** How broad the shoulders are. Low is round, high is pointed. */
  readonly fullness: number
}

/** A profile plus the proportions the term also names. */
export interface LeafShape extends ProfileShape {
  /** Width relative to length, as a multiple of the trait. */
  readonly aspect: number
}

/**
 * The eight outline terms this milestone needs.
 *
 * `mode` comes straight from the standard definitions: ovate and lanceolate are
 * "broader below the middle", elliptic is "symmetrical about the middle",
 * obovate, oblanceolate and spathulate are "broadest above the middle". `aspect`
 * encodes the proportions those definitions also name — linear is "length:width
 * greater than 10 to 15", orbicular is "circular".
 *
 * Terms are appended, never inserted, because allele index is the dominance
 * series and stored genomes are positional. Deltoid, reniform, sagittate and
 * hastate are appended when a species needs them.
 */
export const LEAF_OUTLINES: Readonly<Record<string, LeafShape>> = {
  // `aspect` deviates from 1 only where the definition itself names
  // proportions. Ovate and oblanceolate are about WHERE the widest point is,
  // not how narrow the blade is, so they leave width alone and let the species
  // traits set it. Rescaling them here shrank leaves for no botanical reason.
  orbicular: { mode: 0.5, fullness: 0.7, aspect: 1.3 },
  ovate: { mode: 0.35, fullness: 1.6, aspect: 1.0 },
  obovate: { mode: 0.65, fullness: 1.6, aspect: 1.0 },
  elliptic: { mode: 0.5, fullness: 1.8, aspect: 1.0 },
  // "Lanceolate leaves are narrowly ovate", so this one does narrow.
  lanceolate: { mode: 0.38, fullness: 3.2, aspect: 0.72 },
  // "Length:width greater than 10 to 15".
  linear: { mode: 0.5, fullness: 7, aspect: 0.28 },
  spatulate: { mode: 0.76, fullness: 3.4, aspect: 1.0 },
  oblanceolate: { mode: 0.7, fullness: 2.6, aspect: 1.0 },
}

/** The reference outline, used when a phenotype names one we do not have. */
export const DEFAULT_LEAF_OUTLINE = 'elliptic'

/**
 * The half-width profile, normalised so its maximum is exactly one.
 *
 * A Beta shape, `t^a * (1-t)^b`, with the exponents chosen so the peak lands on
 * the requested mode: the maximum of that expression is at `a / (a + b)`, so
 * setting `a = mode * fullness` and `b = (1 - mode) * fullness` gives a peak at
 * `mode` and a shoulder breadth controlled by `fullness`.
 */
export function laminaProfile(t: number, shape: ProfileShape): number {
  const clamped = Math.max(0, Math.min(1, t))
  if (clamped <= 0 || clamped >= 1) return 0

  const fullness = Math.max(0.05, shape.fullness)
  const mode = Math.max(0.01, Math.min(0.99, shape.mode))
  const a = mode * fullness
  const b = (1 - mode) * fullness

  const peak = Math.pow(mode, a) * Math.pow(1 - mode, b)
  if (peak <= 0) return 0
  return Math.pow(clamped, a) * Math.pow(1 - clamped, b) / peak
}

/**
 * How a margin term modulates the profile. The value is a multiplier on the
 * half-width, so 1 leaves the outline alone and 0 cuts to the midrib.
 */
export interface MarginTerm {
  /** How many lobes or teeth along the blade. */
  readonly count: number
  /** How deep the cut goes: 0 is smooth, 1 reaches the midrib. */
  readonly depth: number
  /**
   * Which way the teeth lean. Positive points the lobe at the apex, which is
   * serrate; negative points it back at the base, which is runcinate.
   *
   * A lobe's apex is where the blade is widest. So leaning forward means the
   * widest part of each period comes LATE, after the sinus, and leaning back
   * means it comes early. The first version had this inverted, and measuring
   * the width across one lobe period is what showed it: serrate was cutting
   * late and runcinate was pointing forward, the opposite of both definitions.
   */
  readonly lean: number
  /** High is a sharp triangular tooth, low is a rounded one. */
  readonly sharpness: number
}

/**
 * The margin terms. `entire` is the identity and the fallback.
 *
 * Depths and counts are reasoned from the definitions rather than measured:
 * serrate and dentate are shallow and many, lobed and pinnatifid deep and few,
 * and runcinate is pinnatifid with the lobes leaning back toward the base.
 */
export const LEAF_MARGINS: Readonly<Record<string, MarginTerm>> = {
  entire: { count: 0, depth: 0, lean: 0, sharpness: 1 },
  serrate: { count: 11, depth: 0.18, lean: 1, sharpness: 1 },
  dentate: { count: 9, depth: 0.24, lean: 0, sharpness: 1.8 },
  crenate: { count: 9, depth: 0.16, lean: 0, sharpness: 0.55 },
  lobed: { count: 5, depth: 0.45, lean: 0, sharpness: 1.2 },
  // Pinnatifid cuts most of the way to the midrib; runcinate is the same
  // depth with the lobes leaning back toward the base, which is what makes a
  // dandelion leaf read as one.
  pinnatifid: { count: 8, depth: 0.72, lean: -1, sharpness: 1.3 },
  runcinate: { count: 7, depth: 0.86, lean: -1, sharpness: 1.5 },
}

/**
 * A window that fades the margin cut to nothing at the base and the apex.
 *
 * Without it the deepest lobe lands on the petiole attachment and the blade
 * detaches from its stalk, and the apex loses its point.
 */
function marginWindow(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return Math.min(1, Math.sin(Math.PI * clamped) * 3.2)
}

/**
 * The multiplier a margin term applies at `t`.
 *
 * A sawtooth whose steep side faces the apex when it leans forward and the base
 * when it leans back, so serrate and runcinate differ in the direction of the
 * cut rather than only in depth.
 */
export function marginFactor(t: number, margin: string, seed: string): number {
  const term = LEAF_MARGINS[margin]
  if (term === undefined || term.depth <= 0 || term.count <= 0) return 1

  const phase = rngFrom(`margin|${seed}`)() * 0.5
  const scaled = t * term.count + phase
  const within = scaled - Math.floor(scaled)

  // Three directions, not two. A positive lean puts the deepest cut at the
  // start of the period, so the lobe that follows points at the apex. A
  // negative lean does the mirror, pointing lobes at the base. Zero is a
  // genuinely symmetric tooth, because dentate, crenate and lobed describe the
  // SHAPE of a tooth and say nothing about which way it leans. Treating zero as
  // "negative" made them silently directional.
  const tooth =
    term.lean === 0
      ? Math.abs(2 * within - 1) ** term.sharpness
      : (term.lean > 0 ? 1 - within : within) ** term.sharpness
  const cut = term.depth * tooth * marginWindow(t)
  return Math.max(0, 1 - cut)
}

export interface LeafGeometry {
  readonly length: number
  readonly width: number
  readonly outline: string
  readonly margin: string
  readonly seed: string
}

function shapeFor(outline: string): LeafShape {
  return (
    LEAF_OUTLINES[outline] ??
    LEAF_OUTLINES[DEFAULT_LEAF_OUTLINE] ?? { mode: 0.5, fullness: 1.8, aspect: 1 }
  )
}

/**
 * A closed polygon for a leaf blade, in leaf-local coordinates: the base at the
 * origin, the apex at `(0, length)`, and `+x` to one side.
 *
 * Walks up one side sampling profile and margin together, then back down the
 * other, so the two sides mirror exactly and the polygon closes on itself.
 */
export function leafOutline(leaf: LeafGeometry, samples = 40): readonly Point[] {
  const shape = shapeFor(leaf.outline)
  const halfWidth = (leaf.width / 2) * shape.aspect
  const steps = Math.max(8, Math.floor(samples))

  const side = (sign: number): Point[] => {
    const points: Point[] = []
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      const w = halfWidth * laminaProfile(t, shape) * marginFactor(t, leaf.margin, leaf.seed)
      points.push({ x: sign * Math.max(0, w), y: t * leaf.length })
    }
    return points
  }

  const right = side(1)
  const left = side(-1).reverse()
  return [...right, ...left]
}
