import { applyEpistasis } from './epistasis.ts'
import type { Allele, Genome } from './genome.ts'
import { LOCI, quantitativeTraits, type DiscreteLocus } from './loci.ts'

export interface DiscreteTrait {
  /** Allele names being expressed, highest-ranked first. Two entries when blended. */
  readonly expressed: readonly string[]
  /** Index of the highest-ranked expressed allele. */
  readonly winner: number
  /** True when both copies contribute to the phenotype. */
  readonly blended: boolean
  /** Contribution of `expressed[1]` when blended, in [0, 0.5]. Otherwise 0. */
  readonly secondaryWeight: number
}

export interface Phenotype {
  readonly discrete: Readonly<Record<string, DiscreteTrait>>
  readonly quantitative: Readonly<Record<string, number>>
}

/** Internal, mutable working shape. Returned directly by `express`. */
export interface MutablePhenotype {
  discrete: Record<string, DiscreteTrait>
  quantitative: Record<string, number>
}

/**
 * Resolve a diploid pair at a discrete locus.
 *
 * Allele order in the locus is the dominance series: the higher index is more
 * potent. `blend` then says how the two copies combine:
 *   0   complete dominance: only the higher-ranked allele is expressed
 *   1   codominance: both are expressed equally
 *   betwixt: incomplete dominance, the lower one partly masked
 */
export function resolveDiscrete(
  locus: DiscreteLocus,
  pair: readonly [Allele, Allele],
): DiscreteTrait {
  for (const allele of pair) {
    if (!Number.isInteger(allele) || allele < 0 || allele >= locus.alleles.length) {
      throw new Error(`Invalid allele ${allele} at locus ${locus.id}`)
    }
  }

  const low = Math.min(pair[0], pair[1])
  const high = Math.max(pair[0], pair[1])
  const highName = locus.alleles[high]
  const lowName = locus.alleles[low]
  if (highName === undefined || lowName === undefined) {
    throw new Error(`Missing allele name at locus ${locus.id}`)
  }

  if (low === high || locus.blend === 0) {
    return { expressed: [highName], winner: high, blended: false, secondaryWeight: 0 }
  }

  // blend 0 (complete dominance) -> the lower allele contributes nothing.
  // blend 1 (codominance)       -> both contribute equally, so 0.5.
  // In between: the lower allele is partly masked.
  const secondaryWeight = locus.blend / 2
  return {
    expressed: [highName, lowName],
    winner: high,
    blended: true,
    secondaryWeight,
  }
}

/**
 * Traits that no locus contributes to directly; they are outputs of the
 * epistasis rules in `epistasis.ts`. Declared here so a phenotype always has
 * a complete, predictable shape.
 */
export const DERIVED_TRAITS: Readonly<Record<string, number>> = {
  'pigment.hue': 0,
  'pigment.saturation': 0,
  'pigment.lightness': 0.92,
  'flower.fertility': 1,
}

/**
 * Genotype to phenotype. Discrete loci resolve through `resolveDiscrete`;
 * quantitative loci sum their weight for every copy carrying allele 1.
 */
export function express(genome: Genome): Phenotype {
  const mutable: MutablePhenotype = { discrete: {}, quantitative: {} }

  for (const trait of quantitativeTraits()) mutable.quantitative[trait] = 0
  for (const [trait, value] of Object.entries(DERIVED_TRAITS)) {
    mutable.quantitative[trait] = value
  }

  LOCI.forEach((locus, index) => {
    const pair = genome.alleles[index]
    if (pair === undefined) {
      throw new Error(`Genome is missing locus ${locus.id}; run migrateGenome first`)
    }
    if (locus.kind === 'discrete') {
      mutable.discrete[locus.id] = resolveDiscrete(locus, pair)
      return
    }
    const current = mutable.quantitative[locus.trait] ?? 0
    mutable.quantitative[locus.trait] = current + locus.weight * (pair[0] + pair[1])
  })

  // Epistasis runs last, on the assembled phenotype. The rule table lives in
  // epistasis.ts, which imports only types from this module, so the apparent
  // cycle is erased at runtime by verbatimModuleSyntax.
  applyEpistasis(mutable)
  return mutable
}
