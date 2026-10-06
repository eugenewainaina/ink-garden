import { LOCI, type Locus } from './loci.ts'

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
  /**
   * Phenology. Heritable, but bounded around the species value, so a breeder
   * can select an early line or a late line without a species losing its
   * character. These live here rather than on the template so that there is
   * exactly one source for each fact.
   */
  /** Base temperature for thermal time, in Celsius. */
  readonly thermalBase: number
  /** Growing degree days from germination to bloom. */
  readonly thermalConstant: number
  /** Critical daylength in hours. */
  readonly criticalDaylength: number
  /** Chilling hours required before flowering. */
  readonly vernalizationHours: number
  /**
   * Typical leaf length divided by width for the species.
   *
   * Separate from `leafSize` because size and shape are separate axes: the leaf
   * economics spectrum varies area and proportions independently, and a species
   * cannot be modelled from one number. Without this a dandelion's leaves came
   * out as wide as they were long, where the Flora of New Zealand gives 5 to 30
   * cm long against 1 to 10 cm wide, a ratio of three to six.
   */
  readonly leafAspect: number
  /**
   * Leaf colour, as HSV. A species trait, not a fixed green.
   *
   * Real foliage varies far more than hue alone: rosemary reads grey because
   * dense hairs and a wax layer scatter light, which is low saturation and
   * middling lightness rather than a different green. Drawing every species the
   * same flat green was the most obviously fake thing about the first pictures.
   */
  readonly leafHue: number
  readonly leafSaturation: number
  readonly leafLightness: number
  /**
   * A species multiplier on internode length, which is leaf density.
   *
   * Internode length scales with stature across species, because a taller plant
   * is mostly more internodes rather than longer ones. A species still deviates:
   * Bean's describes rosemary as of "dense, leafy habit", and a real rosemary
   * shoot fits its leaves at about a centimetre apart where stature alone
   * predicts nearly three. So the allometric relation sets the starting point
   * and the species says how tightly it packs its leaves.
   */
  readonly internodeScale: number
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
   * Nominal days to bloom at a mild temperature, for display and for a rough
   * sanity check. The authoritative figures are the thermal fields in
   * `baseline`, which M0b consumes.
   */
  readonly daysToBloom: number
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

/**
 * The four founding species.
 *
 * Baselines use relative units: `stature` runs from 1 for a rosette to 20 for
 * a large tree, and the others are relative to a small herb. `petalCount` is
 * petals per flower, except for head inflorescences like dandelion where the
 * visible "petals" are ligulate florets.
 *
 * Distributions declare only what makes each species distinctive; everything
 * else takes the architecture-aware default.
 *
 * All four are perennials, which is botanically correct but means nothing yet
 * exercises the annual or biennial lifecycle. A fast annual belongs in the
 * founding set at M0c for that reason.
 */

export const ROSEMARY: SpeciesTemplate = {
  id: 'rosemary',
  commonName: 'Rosemary',
  binomial: 'Salvia rosmarinus',
  lineage: 'Salvia',
  lifecycle: 'perennial',
  daysToBloom: 240,
  baseline: {
    petalCount: 5,
    stature: 3,
    leafSize: 3,
    internodeScale: 0.5,
    leafAspect: 17,
    leafHue: 104,
    leafSaturation: 0.42,
    leafLightness: 0.42,
    flowerSize: 1.4,
    stemThickness: 1.5,
    thermalBase: 6,
    thermalConstant: 1400,
    criticalDaylength: 12,
    vernalizationHours: 100,
  },
  distributions: {
    'leaf.form': [1, 0, 0, 0, 0],
    'leaf.margin': [1, 0, 0, 0, 0, 0, 0],
    'leaf.outline': [0, 0, 0, 0, 0, 1, 0, 0],
    'habit.growth_form': [1, 0],
    'leaf.venation': [1, 0, 0],
    'phyllotaxis.pattern': [0, 1, 0, 0],
    // A bushy shrub: buds are suppressed about half the time and branches
    // leave the stem at a wide angle.
    'branch.apical_dominance.a': [0.35, 0.65],
    'branch.apical_dominance.b': [0.35, 0.65],
    'branch.angle.a': [0.4, 0.6],
    'branch.angle.b': [0.4, 0.6],
    'stem.pigment': [0.25, 0.75],
    'thorn.presence': [0.05, 0.95],
    'inflorescence.type': [0, 0, 0, 0, 0, 0, 0, 1],
    'flower.symmetry': [0, 1],
    'petal.shape': [0, 0, 0.3, 0.7, 0],
    // Pale: an anthocyanidin identity sets the hue, and this sets how much of
    // it there is. Low intensity is what makes a violet corolla pale rather
    // than deep.
    'pigment.intensity.a': [0.94, 0.06],
    'pigment.intensity.b': [0.94, 0.06],
    'pigment.intensity.c': [0.94, 0.06],
    'pigment.anthocyanidin': [0.05, 0.1, 0.25, 0.6],
    'pigment.carotenoid': [1, 0, 0, 0],
    'photoperiod.response': [0.3, 0.4, 0.3],
    // Rosemary does not need a winter to flower. Leaving this undeclared gave
    // it the polymorphic default, which made most plants demand chilling they
    // could never get in Nairobi, and they held at bud forever.
    'vernalization.required': [1, 0],
    'habit.height.a': [0.7, 0.3],
    'leaf.length.a': [0.85, 0.15],
    'leaf.width.a': [0.95, 0.05],
    'lifecycle': [0, 0, 1],
  },
}

export const DANDELION: SpeciesTemplate = {
  id: 'dandelion',
  commonName: 'Dandelion',
  binomial: 'Taraxacum officinale',
  lineage: 'Taraxacum',
  lifecycle: 'perennial',
  daysToBloom: 45,
  baseline: {
    // A head of roughly fifty ligulate florets, not five petals.
    petalCount: 50,
    stature: 1.5,
    leafSize: 14,
    internodeScale: 1,
    leafAspect: 4.2,
    leafHue: 100,
    leafSaturation: 0.55,
    leafLightness: 0.42,
    flowerSize: 5.5,
    stemThickness: 0.4,
    thermalBase: 4,
    thermalConstant: 420,
    criticalDaylength: 13,
    vernalizationHours: 100,
  },
  distributions: {
    'leaf.form': [1, 0, 0, 0, 0],
    // The three traits the acceptance test turns on: a narrow blade that
    // is widest above the middle, lobes that lean back toward the base, and
    // no internode elongation at all.
    'leaf.margin': [0, 0, 0, 0, 0, 0, 1],
    'leaf.outline': [0, 0, 0, 0, 0, 0, 0, 1],
    'habit.growth_form': [0, 1],
    'leaf.venation': [1, 0, 0],
    'phyllotaxis.pattern': [0.1, 0.05, 0.05, 0.8],
    // A dandelion has one scape and does not branch. Nearly total dominance.
    'branch.apical_dominance.a': [0.03, 0.97],
    'branch.apical_dominance.b': [0.03, 0.97],
    'thorn.presence': [1, 0],
    'inflorescence.type': [0.04, 0, 0, 0, 0, 0, 0.96, 0],
    'flower.symmetry': [1, 0],
    'petal.shape': [0, 0, 0.2, 0.8, 0],
    'petal.margin': [0, 0, 0.3, 0.7],
    'pigment.anthocyanidin': [1, 0, 0, 0],
    'pigment.carotenoid': [0.05, 0.85, 0.1, 0],
    'photoperiod.response': [0.7, 0.2, 0.1],
    'vernalization.required': [1, 0],
    'habit.height.a': [0.8, 0.2],
    'thermal.constant.a': [0.85, 0.15],
    'lifecycle': [0, 0, 1],
  },
}

export const SPEARMINT: SpeciesTemplate = {
  id: 'spearmint',
  commonName: 'Spearmint',
  binomial: 'Mentha spicata',
  lineage: 'Mentha',
  lifecycle: 'perennial',
  daysToBloom: 90,
  baseline: {
    petalCount: 5,
    stature: 2,
    leafSize: 4.2,
    internodeScale: 0.8,
    leafAspect: 4.5,
    leafHue: 100,
    leafSaturation: 0.48,
    leafLightness: 0.54,
    flowerSize: 0.35,
    stemThickness: 0.4,
    thermalBase: 5,
    thermalConstant: 700,
    criticalDaylength: 14,
    vernalizationHours: 150,
  },
  distributions: {
    'leaf.form': [1, 0, 0, 0, 0],
    'leaf.margin': [0, 1, 0, 0, 0, 0, 0],
    'leaf.outline': [0, 0, 1, 0, 0, 0, 0, 0],
    'habit.growth_form': [1, 0],
    'leaf.venation': [1, 0, 0],
    'phyllotaxis.pattern': [0, 0.95, 0.05, 0],
    // A mint spreads by runners rather than branching much.
    'branch.apical_dominance.a': [0.15, 0.85],
    'branch.apical_dominance.b': [0.15, 0.85],
    'stem.pigment': [1, 0],
    'thorn.presence': [1, 0],
    'inflorescence.type': [0, 0.95, 0, 0, 0, 0, 0, 0.05],
    'flower.symmetry': [0, 1],
    'petal.shape': [0, 0, 0.4, 0.6, 0],
    // A white corolla is near-absent anthocyanin. The frequency has to be
    // pushed harder than the 22 per cent a pale pink would suggest, because
    // the locus is codominant and its allele order runs none, pelargonidin,
    // cyanidin, delphinidin: any anthocyanin outranks none in the dominance
    // series, and dominance is a property of the locus rather than of the
    // species. A species that needs the normal state to dominate cannot say
    // so, which is a real limitation of the model and not just of this line.
    'pigment.anthocyanidin': [0.97, 0.03, 0, 0],
    'pigment.carotenoid': [1, 0, 0, 0],
    'photoperiod.response': [0.2, 0.3, 0.5],
    'vernalization.required': [1, 0],
    'habit.height.a': [0.55, 0.45],
    'lifecycle': [0, 0, 1],
  },
}

export const JACARANDA: SpeciesTemplate = {
  id: 'jacaranda',
  commonName: 'Jacaranda',
  binomial: 'Jacaranda mimosifolia',
  lineage: 'Jacaranda',
  lifecycle: 'perennial',
  daysToBloom: 2900,
  baseline: {
    petalCount: 5,
    stature: 20,
    leafSize: 26,
    internodeScale: 1,
    leafAspect: 2.4,
    leafHue: 92,
    leafSaturation: 0.38,
    leafLightness: 0.66,
    flowerSize: 4.5,
    stemThickness: 8,
    thermalBase: 10,
    thermalConstant: 18000,
    criticalDaylength: 12,
    vernalizationHours: 200,
  },
  distributions: {
    'leaf.form': [0, 0.05, 0.95, 0, 0],
    'leaf.margin': [1, 0, 0, 0, 0, 0, 0],
    'leaf.outline': [1, 0, 0, 0, 0, 0, 0, 0],
    'habit.growth_form': [1, 0],
    'leaf.venation': [1, 0, 0],
    'phyllotaxis.pattern': [0, 1, 0, 0],
    // A tree: a single trunk for metres before it forks, and branches that
    // leave at a narrower angle than a shrub's.
    'branch.apical_dominance.a': [0.1, 0.9],
    'branch.apical_dominance.b': [0.1, 0.9],
    'branch.angle.a': [0.3, 0.7],
    'branch.angle.b': [0.3, 0.7],
    'thorn.presence': [0.96, 0.04],
    'inflorescence.type': [0.05, 0, 0.05, 0.9, 0, 0, 0, 0],
    'flower.symmetry': [0, 1],
    'flower.throat': [0.1, 0.85, 0.05],
    'petal.shape': [0, 0, 0, 0.2, 0.8],
    // The delphinidin branch, with copigment, is what makes jacaranda violet
    // rather than magenta. True blue stays out of reach without the pH shift.
    'pigment.anthocyanidin': [0.02, 0.03, 0.05, 0.9],
    'pigment.carotenoid': [1, 0, 0, 0],
    'pigment.copigment.a': [0.15, 0.85],
    'photoperiod.response': [0.5, 0.4, 0.1],
    'vernalization.required': [0.6, 0.4],
    'habit.height.a': [0.05, 0.95],
    'branch.count.a': [0.1, 0.9],
    'lifecycle': [0, 0, 1],
  },
}

export const SPECIES: readonly SpeciesTemplate[] = [
  ROSEMARY,
  DANDELION,
  SPEARMINT,
  JACARANDA,
]

/**
 * The normalised value a species' own distribution expects for a quantitative
 * trait.
 *
 * A species declares the FREQUENCY of each allele; this reads back the trait
 * value that follows, so the genome can vary around the species' centre rather
 * than around the middle of the whole possible range. The distinction matters:
 * two loci of equal weight give a normalised value of 0, 0.25, 0.5, 0.75 or 1,
 * and used raw that spread a rosemary's branching from 2 per cent of buds to
 * 92, which is a thicket at one extreme and a bare pole at the other.
 */
export function expectedNormalised(template: SpeciesTemplate, trait: string): number {
  let weight = 0
  let expected = 0
  for (const locus of LOCI) {
    if (locus.kind !== 'quantitative' || locus.trait !== trait) continue
    const distribution = template.distributions[locus.id] ?? defaultDistribution(locus)
    let allele = 0
    for (let i = 0; i < distribution.length; i += 1) {
      allele += i * (distribution[i] ?? 0)
    }
    // Both copies are drawn independently, so the pair expects twice the mean.
    expected += locus.weight * 2 * allele
    weight += locus.weight * 2
  }
  if (weight <= 0) return 0.5
  return Math.max(0, Math.min(1, expected / weight))
}
