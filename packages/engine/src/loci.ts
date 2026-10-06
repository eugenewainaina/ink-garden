export type LocusKind = 'discrete' | 'quantitative'

/**
 * How a trait is inherited in reality, which determines how much variation is
 * expressed and how common a non-reference allele is.
 *
 * - `canalised`   Developmental robustness. Real floral development is
 *                 "remarkably robust in terms of the identity and number of
 *                 floral organs in each whorl", and that robustness actively
 *                 suppresses hidden variation (Monniaux et al. 2016, Ann Bot).
 *                 So the reference allele is near-fixed and a species must
 *                 declare anything it does differently.
 * - `polymorphic` Genuinely variable within a species. Moderate frequencies.
 * - `homeotic`    A rare regulatory mutation that changes organ identity.
 *                 Almost always the reference allele; the mutant is uncommon.
 *                 This is where ornamental novelty comes from. Double flowers
 *                 and green petals are both homeotic (Li et al. 2026, Hortic
 *                 Res; Katsumoto et al. 2007 for the delphinidin case).
 */
export type Architecture = 'canalised' | 'polymorphic' | 'homeotic'

/**
 * A discrete locus. Allele order is the dominance series: under complete
 * dominance (blend 0) the higher index always wins.
 */
export interface DiscreteLocus {
  readonly id: string
  readonly kind: 'discrete'
  readonly alleles: readonly string[]
  /** 0 = complete dominance, 1 = codominance, between = incomplete. */
  readonly blend: number
  /** Probability per copy of mutating on a cross. */
  readonly mutation: number
  readonly architecture: Architecture
  /**
   * Which allele is the normal, wild-type state. Defaults to 0. This is not
   * always index 0, because allele order is the dominance series and the
   * dominant allele can be the derived one: `flower.canalisation` is listed
   * decanalised first so that canalised dominates, but canalised is the
   * normal state and therefore the reference.
   */
  readonly referenceAllele?: number
}

/**
 * A quantitative locus contributing `weight` per copy carrying allele 1.
 * These are the traits that really are polygenic: "many genes of small
 * effect" (Pieper et al. 2016, New Phytol).
 */
export interface QuantitativeLocus {
  readonly id: string
  readonly kind: 'quantitative'
  readonly trait: string
  readonly weight: number
  readonly mutation: number
}

export type Locus = DiscreteLocus | QuantitativeLocus

const d = (
  id: string,
  alleles: readonly string[],
  blend: number,
  architecture: Architecture,
  mutation = 0.004,
  referenceAllele = 0,
): DiscreteLocus => ({
  id,
  kind: 'discrete',
  alleles,
  blend,
  mutation,
  architecture,
  referenceAllele,
})

const q = (
  id: string,
  trait: string,
  weight: number,
  mutation = 0.004,
): QuantitativeLocus => ({ id, kind: 'quantitative', trait, weight, mutation })

/**
 * The catalogue, in locus order. A genome's allele array is parallel to this.
 * Adding a locus is a one-line change, and migrateGenome fills it for
 * existing plants deterministically.
 *
 * Counts: 26 discrete, 53 quantitative. First pass; tuned at M0c.
 */
export const LOCI: readonly Locus[] = [
  // Master identity. Canalised: organ identity and count are robust, and
  // variation only appears when that robustness is lost.
  d('flower.organ.identity', ['sepals.petaloid', 'normal'], 0, 'homeotic', 0.002, 1),
  d('flower.doubling', ['double', 'single'], 0, 'homeotic', 0.006, 1),
  d('flower.symmetry', ['actinomorphic', 'zygomorphic'], 1, 'canalised'),
  d('inflorescence.type', ['solitary', 'spike', 'raceme', 'panicle', 'umbel', 'corymb', 'head', 'cyme'], 1, 'canalised'),
  d('leaf.form', ['simple', 'pinnate', 'bipinnate', 'palmate', 'cordate'], 1, 'canalised'),

  // The canalisation switch itself. Reference is `canalised`, which is
  // dominant, so losing robustness needs two copies. When it is lost, the
  // petal-variance loci below stop being silent.
  d('flower.canalisation', ['decanalised', 'canalised'], 0, 'homeotic', 0.002, 1),

  // Habit and stem
  d('habit.determinacy', ['determinate', 'indeterminate'], 0.5, 'canalised'),
  d('phyllotaxis.pattern', ['alternate', 'decussate', 'whorled', 'spiral'], 1, 'canalised'),
  d('stem.pigment', ['green', 'red.brown'], 0.5, 'polymorphic'),
  d('stem.pubescence', ['glabrous', 'pubescent'], 1, 'polymorphic'),
  q('habit.height.a', 'height', 0.09),
  q('habit.height.b', 'height', 0.06),
  q('internode.length.a', 'internode.length', 0.11),
  q('internode.length.b', 'internode.length', 0.07),
  q('stem.thickness.a', 'stem.thickness', 0.04),
  q('stem.thickness.b', 'stem.thickness', 0.02),
  q('branch.angle.a', 'branch.angle', 0.08),
  q('branch.angle.b', 'branch.angle', 0.05),
  q('branch.count.a', 'branch.count', 0.6),
  q('branch.count.b', 'branch.count', 0.35),
  q('branch.apical_dominance.a', 'branch.apical_dominance', 0.09),
  q('branch.apical_dominance.b', 'branch.apical_dominance', 0.06),

  // Leaf
  d('leaf.margin', ['entire', 'serrate', 'dentate', 'lobed', 'crenate', 'pinnatifid', 'runcinate'], 1, 'canalised'),
  d('leaf.venation', ['pinnate', 'palmate', 'parallel'], 1, 'canalised'),
  d('leaf.variegation', ['none', 'marginal', 'splashed', 'striped'], 0, 'homeotic', 0.004),
  d('leaf.pubescence', ['glabrous', 'pubescent'], 1, 'polymorphic'),
  q('leaf.length.a', 'leaf.length', 0.5),
  q('leaf.length.b', 'leaf.length', 0.28),
  q('leaf.width.a', 'leaf.width', 0.22),
  q('leaf.width.b', 'leaf.width', 0.13),
  q('leaf.petiole', 'leaf.petiole', 0.18),
  q('leaf.gloss', 'leaf.gloss', 0.06),

  // Armature
  d('thorn.presence', ['thornless', 'thorned'], 1, 'polymorphic'),
  q('thorn.density.a', 'thorn.density', 0.5),
  q('thorn.density.b', 'thorn.density', 0.32),
  q('thorn.curvature', 'thorn.curvature', 0.07),
  q('thorn.length', 'thorn.length', 0.16),

  // Flower
  d('petal.shape', ['rounded', 'obovate', 'spatulate', 'ligulate', 'clawed'], 1, 'canalised'),
  d('petal.margin', ['entire', 'ruffled', 'fringed', 'notched'], 0.5, 'canalised'),
  d('flower.throat', ['open', 'tubular', 'spurred'], 1, 'canalised'),
  d('nectar_guide', ['absent', 'present'], 1, 'polymorphic'),
  q('flower.diameter.a', 'flower.diameter', 0.55),
  q('flower.diameter.b', 'flower.diameter', 0.34),
  // Cryptic variation for petal number. Silent unless `flower.canalisation`
  // is lost. This is the "cryptic genetic variation" of Monniaux et al.
  q('petal.variance.a', 'petal.variance', 0.5),
  q('petal.variance.b', 'petal.variance', 0.3),
  q('petal.length.a', 'petal.length', 0.3),
  q('petal.length.b', 'petal.length', 0.19),
  q('petal.width', 'petal.width', 0.15),
  q('petal.curl', 'petal.curl', 0.08),
  q('petal.overlap', 'petal.overlap', 0.1),
  q('petal.substance', 'petal.substance', 0.1),

  // Pigment. Species-characteristic, so canalised: a species is usually one
  // colour, and white is a perfectly plausible default.
  d('pigment.anthocyanidin', ['none', 'pelargonidin', 'cyanidin', 'delphinidin'], 1, 'polymorphic'),
  d('pigment.carotenoid', ['none', 'yellow', 'orange', 'red'], 1, 'polymorphic'),
  d('pigment.petal.chlorophyll', ['green', 'none'], 0, 'homeotic', 0.003, 1),
  d('pigment.pattern', ['solid', 'gradient', 'picotee', 'blotch', 'speckled'], 0.5, 'polymorphic'),
  q('pigment.intensity.a', 'pigment.intensity', 0.4),
  q('pigment.intensity.b', 'pigment.intensity', 0.25),
  q('pigment.intensity.c', 'pigment.intensity', 0.15),
  q('pigment.copigment.a', 'pigment.copigment', 0.4),
  q('pigment.copigment.b', 'pigment.copigment', 0.22),
  q('pigment.vacuolar.ph.a', 'pigment.vacuolar.ph', 0.4),
  q('pigment.vacuolar.ph.b', 'pigment.vacuolar.ph', 0.24),
  q('pigment.cold.response', 'pigment.cold.response', 0.3),
  q('pigment.gradient_extent', 'pigment.gradient_extent', 0.3),
  q('pigment.tip_shift', 'pigment.tip_shift', 0.2),

  // Phenology
  d('photoperiod.response', ['day.neutral', 'short.day', 'long.day'], 1, 'polymorphic'),
  d('vernalization.required', ['none', 'required'], 1, 'polymorphic'),
  q('thermal.base_temp.a', 'thermal.base_temp', 2.5),
  q('thermal.base_temp.b', 'thermal.base_temp', 1.5),
  q('thermal.constant.a', 'thermal.constant', 90),
  q('thermal.constant.b', 'thermal.constant', 55),
  q('thermal.constant.c', 'thermal.constant', 30),
  q('photoperiod.critical', 'photoperiod.critical', 0.6),
  q('vernalization.hours', 'vernalization.hours', 80),
  q('dormancy.depth', 'dormancy.depth', 0.35),
  q('senescence.rate', 'senescence.rate', 0.25),

  // Lifecycle and allocation
  d('lifecycle', ['annual', 'biennial', 'perennial'], 0, 'canalised'),
  q('allocation.root_shoot', 'allocation.root_shoot', 0.15),
  q('allocation.leaf_vs_stem', 'allocation.leaf_vs_stem', 0.15),

  // --- Added in genome version 2. Appended, never inserted. ---
  //
  // Allele pairs are positional and allele index is the dominance series, so
  // inserting a locus would silently change what every stored plant means.
  // Everything new goes here, at the end, and migrateGenome fills the gap.
  //
  // Both references are chosen to mean "as before": an undeclared species is
  // erect with an elliptic leaf, which is what it was before these loci
  // existed. That is what lets a version 1 plant keep the appearance it had.

  // Growth form. Canalised, because habit is what a species IS: a dandelion
  // does not become a shrub by breeding. It can still shift by mutation, which
  // is where ornamental sports come from.
  d('habit.growth_form', ['erect', 'rosette'], 0, 'canalised'),

  // Lamina outline. `elliptic` is the reference so the default is a plain leaf
  // rather than an odd one. Terms are appended, so deltoid, reniform, sagittate
  // and hastate can join later without disturbing anything.
  d(
    'leaf.outline',
    [
      'elliptic',
      'orbicular',
      'ovate',
      'obovate',
      'lanceolate',
      'linear',
      'spatulate',
      'oblanceolate',
    ],
    0,
    'canalised',
  ),
]

export const LOCUS_INDEX: ReadonlyMap<string, number> = new Map(
  LOCI.map((locus, index) => [locus.id, index]),
)

export function locusAt(index: number): Locus {
  const locus = LOCI[index]
  if (locus === undefined) throw new Error(`No locus at index ${index}`)
  return locus
}

export function locusIndex(id: string): number {
  const index = LOCUS_INDEX.get(id)
  if (index === undefined) throw new Error(`Unknown locus: ${id}`)
  return index
}

export function locusById(id: string): Locus {
  return locusAt(locusIndex(id))
}

let cachedTraits: readonly string[] | undefined

/** The sorted, de-duplicated list of quantitative trait names. */
export function quantitativeTraits(): readonly string[] {
  if (cachedTraits === undefined) {
    const found = new Set<string>()
    for (const locus of LOCI) {
      if (locus.kind === 'quantitative') found.add(locus.trait)
    }
    cachedTraits = [...found].sort()
  }
  return cachedTraits
}

let cachedMaxima: ReadonlyMap<string, number> | undefined

/**
 * The largest value a quantitative trait can reach, being the sum of the
 * weights of every locus contributing to it. Used to normalise a genomic
 * value into 0..1 before a species scale is applied.
 */
export function traitMaximum(trait: string): number {
  if (cachedMaxima === undefined) {
    const maxima = new Map<string, number>()
    for (const locus of LOCI) {
      if (locus.kind !== 'quantitative') continue
      maxima.set(locus.trait, (maxima.get(locus.trait) ?? 0) + locus.weight * 2)
    }
    cachedMaxima = maxima
  }
  const max = cachedMaxima.get(trait)
  if (max === undefined) throw new Error(`Unknown quantitative trait: ${trait}`)
  return max
}
