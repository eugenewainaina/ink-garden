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
  const nodes = Math.max(4, Math.min(24, Math.round(4 + species.baseline.stature * 0.6)))

  // Branch angle runs from nearly upright to nearly horizontal. The lower bound
  // is not zero: a branch at zero degrees is indistinguishable from the stem.
  const branchAngle = 12 + normalisedTrait(phenotype, 'branch.angle') * 58

  return {
    nodes,
    pattern,
    internodeLength: phenotype.quantitative['internode.length'] ?? 1,
    leafLength: phenotype.quantitative['leaf.length'] ?? 1,
    leafWidth: phenotype.quantitative['leaf.width'] ?? 0.5,
    apicalDominance: normalisedTrait(phenotype, 'branch.apical_dominance'),
    branchAngle,
  }
}
