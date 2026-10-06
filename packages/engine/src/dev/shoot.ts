import { normalisedTrait, type Phenotype } from '../phenotype.ts'
import type { SpeciesTemplate } from '../species.ts'
import type { Phyllotaxis } from './phyllotaxis.ts'

/** Everything the meristem needs to build a shoot, in physical units. */
export interface ShootGeometry {
  readonly nodes: number
  readonly pattern: Phyllotaxis
  readonly internodeLength: number
  readonly leafLength: number
  readonly leafWidth: number
  /** Zero to one. One means buds are fully suppressed and the plant is a stick. */
  readonly apicalDominance: number
  /** Degrees from the parent axis. */
  readonly branchAngle: number
  /**
   * How far a leaf stands out from the stem, in degrees.
   *
   * A trait rather than a module constant, because it is the difference
   * between a rosette and an upright herb: a rosette's leaves lie out flat
   * near the ground, an erect herb's stand up around its stem.
   */
  readonly divergenceDeg: number
}

/** The growth forms the engine implements. */
export type GrowthForm = 'erect' | 'rosette'

/**
 * Which growth form a plant takes.
 *
 * Canalised, so a species pins it and reading an expressed allele is enough.
 * An unknown or absent value falls back to erect, which is the state every
 * plant was in before this locus existed.
 */
export function growthFormOf(phenotype: Phenotype): GrowthForm {
  const expressed = phenotype.discrete['habit.growth_form']?.expressed[0]
  return expressed === 'rosette' ? 'rosette' : 'erect'
}

const PATTERNS: readonly Phyllotaxis[] = ['alternate', 'decussate', 'whorled', 'spiral']

/**
 * Turn a phenotype into meristem parameters.
 *
 * This layer exists because of a units bug worth recording. `branch.angle` and
 * `branch.apical_dominance` are stored normalised, in 0..0.26 and 0..0.3, and
 * `SCALED_BY_BASELINE` in phenotype.ts converts morphology traits into physical
 * units but did not cover these two. So the meristem was handed 0.13 where it
 * wanted degrees and 0.12 where it wanted a probability, which would have made
 * every branch vertical and nearly every bud grow: a bundle of parallel stems
 * rather than a plant.
 *
 * Every value here is either already physical (lengths, which the species
 * baselines scale into centimetres) or mapped explicitly from a normalised
 * trait. Nothing is passed through on the assumption it is already in range.
 */
export function shootGeometry(
  phenotype: Phenotype,
  species: SpeciesTemplate,
  seed: string,
): ShootGeometry {
  const expressed = phenotype.discrete['phyllotaxis.pattern']?.expressed[0] ?? 'spiral'
  const pattern = PATTERNS.find((p) => p === expressed) ?? 'spiral'

  // A young plant. Full stature at a jacaranda's internode length would need
  // well over a hundred nodes, which is a mature tree, not a seedling.
  // Internode count grows with stature, because a taller plant is mostly MORE
  // internodes rather than longer ones. The first version gave a shrub six
  // nodes, which is a seedling: real rosemary carries leaves at every node of
  // every shoot and is dense with them.
  const nodes = Math.max(6, Math.min(40, Math.round(6 + species.baseline.stature * 1.3)))

  // Branch angle runs from nearly upright to nearly horizontal. The lower bound
  // is not zero: a branch at zero degrees is indistinguishable from the stem.
  const branchAngle = 12 + normalisedTrait(phenotype, 'branch.angle') * 58

  const form = growthFormOf(phenotype)
  // A rosette leaf leaves the crown rising steeply and then arches out, so
  // the divergence is the ANGLE AT THE BASE, not the average posture.
  const divergenceDeg = form === 'rosette' ? 45 : 55

  return {
    nodes,
    pattern,
    divergenceDeg,
    internodeLength: phenotype.quantitative['internode.length'] ?? 1,
    leafLength: phenotype.quantitative['leaf.length'] ?? 1,
    leafWidth: phenotype.quantitative['leaf.width'] ?? 0.5,
    apicalDominance: normalisedTrait(phenotype, 'branch.apical_dominance'),
    branchAngle,
  }
}
