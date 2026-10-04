import { applyEpistasis } from './epistasis.ts'
import type { Allele, Genome } from './genome.ts'
import {
  LOCI,
  quantitativeTraits,
  traitMaximum,
  type DiscreteLocus,
} from './loci.ts'
import type { PhenotypeBaseline, SpeciesTemplate } from './species.ts'

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

/** Internal, mutable working shape. */
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
 * Traits that no locus contributes to directly. Colour and fertility are
 * outputs of the epistasis rules; `petal.count` is a species-level trait and
 * is only set by `expressPlant`, because a petal count is meaningless without
 * knowing the species.
 */
export const DERIVED_TRAITS: Readonly<Record<string, number>> = {
  'pigment.hue': 0,
  'pigment.saturation': 0,
  'pigment.lightness': 0.92,
  'flower.fertility': 1,
}

/** How far a quantitative trait may move from its species baseline. */
export const BASELINE_SPREAD = 0.5

/**
 * The genomic layer: genotype to phenotype, with no knowledge of species.
 * Discrete loci resolve through `resolveDiscrete`, quantitative loci sum their
 * weight per copy carrying allele 1, and epistasis runs last.
 */
export function expressMutable(genome: Genome): MutablePhenotype {
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

/** The genomic phenotype, without a species. */
export function express(genome: Genome): Phenotype {
  return expressMutable(genome)
}

/** A quantitative trait as a fraction of the largest value it could reach. */
function normalised(phenotype: MutablePhenotype, trait: string): number {
  const max = traitMaximum(trait)
  if (max <= 0) return 0
  const raw = (phenotype.quantitative[trait] ?? 0) / max
  return Math.max(0, Math.min(1, raw))
}

/** Map a normalised genomic value onto a range around the species baseline. */
function scaleAround(baseline: number, value: number): number {
  return baseline * (1 - BASELINE_SPREAD + 2 * BASELINE_SPREAD * value)
}

/** Which species baseline field scales which quantitative trait. */
const SCALED_BY_BASELINE: ReadonlyArray<{
  readonly trait: string
  readonly field: keyof PhenotypeBaseline
}> = [
  { trait: 'height', field: 'stature' },
  { trait: 'internode.length', field: 'stature' },
  { trait: 'stem.thickness', field: 'stemThickness' },
  { trait: 'leaf.length', field: 'leafSize' },
  { trait: 'leaf.width', field: 'leafSize' },
  { trait: 'leaf.petiole', field: 'leafSize' },
  { trait: 'flower.diameter', field: 'flowerSize' },
  { trait: 'petal.length', field: 'flowerSize' },
  { trait: 'petal.width', field: 'flowerSize' },
  // Phenology is heritable but bounded, exactly like morphology: the species
  // sets the value and the genome moves it within the spread.
  { trait: 'thermal.base_temp', field: 'thermalBase' },
  { trait: 'thermal.constant', field: 'thermalConstant' },
  { trait: 'photoperiod.critical', field: 'criticalDaylength' },
  { trait: 'vernalization.hours', field: 'vernalizationHours' },
]

/** How far cryptic petal-number variation can shift the canalised value. */
const DECANALISED_SPREAD = 1

/**
 * The plant layer: the genomic phenotype with species baselines applied.
 *
 * This is where canalisation is resolved. Floral development is normally
 * robust enough that organ number does not vary, and that robustness actively
 * suppresses the variation the genome carries ("cryptic genetic variation",
 * Monniaux et al. 2016). So while `flower.canalisation` is intact, petal
 * number is pinned to the species value and `petal.variance` is silent.
 *
 * When canalisation is lost the variation is expressed as **petal loss**, not
 * gain, which is what the published case shows: *Cardamine hirsuta* varies
 * from zero to four petals where four is the family norm (Rambaud-Lavigne
 * et al. 2025). Hence a range of zero to the species value, and zero petals is
 * a legitimate phenotype rather than a bug.
 */
export function expressPlant(
  genome: Genome,
  template: SpeciesTemplate,
): Phenotype {
  const phenotype = expressMutable(genome)

  for (const { trait, field } of SCALED_BY_BASELINE) {
    phenotype.quantitative[trait] = scaleAround(
      template.baseline[field],
      normalised(phenotype, trait),
    )
  }

  const canalised =
    phenotype.discrete['flower.canalisation']?.expressed[0] === 'canalised'
  const base = template.baseline.petalCount

  let petals: number
  if (canalised) {
    petals = base
  } else {
    petals = base * (1 - DECANALISED_SPREAD * normalised(phenotype, 'petal.variance'))
  }

  // A double flower is a homeotic conversion of stamens into petals, so it
  // multiplies whatever the canalisation layer settled on. The fertility cost
  // of the same mutation is applied by the epistasis rule.
  if (phenotype.discrete['flower.doubling']?.expressed[0] === 'double') {
    petals *= 1.9
  }

  phenotype.quantitative['petal.count'] = petals
  return phenotype
}
