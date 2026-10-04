import type { Locus } from './loci.ts'

export type Lifecycle = 'annual' | 'biennial' | 'perennial'

/**
 * Species-typical values that the genome modulates around. Two different
 * reasons for existing:
 *
 * - Canalised traits are *fixed* per species, so the baseline is the value.
 *   A daisy has five petals; the genome does not vote on it unless
 *   canalisation is lost.
 * - Quantitative traits are genuinely heritable, but a tree and a shrub differ
 *   in absolute scale at the same relative trait value, so the baseline sets
 *   the scale and the genome moves it within a bounded range.
 */
export interface PhenotypeBaseline {
  /** Petals per flower while canalisation is intact. */
  readonly petalCount: number
  /** Mature stature in relative units, 1 being a large shrub and 20 a tree. */
  readonly stature: number
  /** Typical leaf length in relative units. */
  readonly leafSize: number
  /** Typical flower diameter in relative units. */
  readonly flowerSize: number
  /** Typical stem thickness in relative units. */
  readonly stemThickness: number
}

/**
 * A species is a distribution over alleles per locus plus a baseline. Loci not
 * listed fall back to `defaultDistribution`, which is architecture-aware, so a
 * species file only needs to state what makes it distinctive.
 */
export interface SpeciesTemplate {
  readonly id: string
  readonly commonName: string
  readonly binomial: string
  /** Genus label used for cultivar naming, e.g. 'Rosa'. */
  readonly lineage: string
  readonly lifecycle: Lifecycle
  /**
   * Nominal days to bloom at a mild temperature. Phenology proper is M0b; the
   * thermal fields below are what M0b consumes.
   */
  readonly daysToBloom: number
  /** Base temperature for thermal time, in Celsius. */
  readonly thermalBase: number
  /** Thermal constant: growing degree days from germination to bloom. */
  readonly thermalConstant: number
  readonly baseline: PhenotypeBaseline
  readonly distributions: Readonly<Record<string, readonly number[]>>
}

/**
 * A distribution whose mass sits on `referenceIndex`, with the remaining
 * alleles spread evenly through the tail.
 */
function withReferenceBias(
  alleleCount: number,
  referenceMass: number,
  referenceIndex = 0,
): number[] {
  if (alleleCount <= 1) return [1]
  const tail = (1 - referenceMass) / (alleleCount - 1)
  return new Array<number>(alleleCount)
    .fill(tail)
    .map((value, index) => (index === referenceIndex ? referenceMass : value))
}

/**
 * The fallback when a species does not specify a locus.
 *
 * Deliberately **not** uniform. Real populations are mostly monomorphic with a
 * tail of rarer variants, and the architecture of a trait determines how much
 * standing variation it carries. Uniform defaults make every unusual trait
 * about 50% likely, which produces a mutant heap rather than a garden: a first
 * pass with uniform defaults gave 75% of plants green petals, where in reality
 * green flowers are "uncommon in nature" (Li et al. 2026, Hortic Res).
 */
export function defaultDistribution(locus: Locus): readonly number[] {
  if (locus.kind === 'quantitative') {
    // Standing quantitative variation: a mild bias to the reference allele,
    // so a population has spread without being extreme.
    return [0.55, 0.45]
  }
  const n = locus.alleles.length
  const reference = locus.referenceAllele ?? 0
  switch (locus.architecture) {
    case 'canalised':
      // Robust and near-fixed. A species that differs must say so.
      return withReferenceBias(n, 0.99, reference)
    case 'homeotic':
      // The normal state is overwhelmingly common and the mutant uncommon.
      return withReferenceBias(n, 0.96, reference)
    case 'polymorphic':
    default:
      return withReferenceBias(n, 0.5, reference)
  }
}

/** The value a foundational plant carries, and how far it may drift. */
export function baselinePetalCount(template: SpeciesTemplate): number {
  return template.baseline.petalCount
}
