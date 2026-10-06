import { normalisedTrait, type Phenotype } from '../phenotype.ts'
import { expectedNormalised, type SpeciesTemplate } from '../species.ts'
import type { Phyllotaxis } from './phyllotaxis.ts'
import type { FlowerStage } from './meristem.ts'

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
  /** Which inflorescence the shoot builds, from the phenotype. */
  readonly inflorescence: string
  /** Width of one flower or head, in centimetres. */
  readonly flowerSize: number
  /** What the flowers are doing: none, closed, or open. */
  readonly flowerStage: FlowerStage
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
 * How much of the genome's full range survives, once the species has set the
 * centre.
 *
 * Real within-species variation in a trait like apical dominance is a modest
 * band around a species typical value, not the whole interval. Four tenths
 * keeps a plant recognisably its species while still giving seedlings
 * individual character.
 */
const GENOME_SPREAD = 0.4

/**
 * A trait value pulled in toward the species' own expectation.
 *
 * The genome keeps its deviation from the species centre, scaled down; what it
 * loses is the ability to sit at a mathematical extreme the species never
 * occupies.
 */
function aroundSpeciesCentre(
  species: SpeciesTemplate,
  phenotype: Phenotype,
  trait: string,
): number {
  const centre = expectedNormalised(species, trait)
  const value = normalisedTrait(phenotype, trait)
  return Math.max(0, Math.min(1, centre + (value - centre) * GENOME_SPREAD))
}

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
  stage = 'bloom',
): ShootGeometry {
  const expressed = phenotype.discrete['phyllotaxis.pattern']?.expressed[0] ?? 'spiral'
  const pattern = PATTERNS.find((p) => p === expressed) ?? 'spiral'

  // A young plant. Full stature at a jacaranda's internode length would need
  // well over a hundred nodes, which is a mature tree, not a seedling.
  // Internode count grows with stature, because a taller plant is mostly MORE
  // internodes rather than longer ones. The first version gave a shrub six
  // nodes, which is a seedling: real rosemary carries leaves at every node of
  // every shoot and is dense with them.
  // A dense species packs more nodes into the same stem, so the node count
  // rises as its internodes shorten. Otherwise packing leaves tightly would
  // just make the plant shorter.
  const packing = Math.max(0.1, species.baseline.internodeScale)
  // The number of phytomers a shoot makes is itself a quantitative trait, and
  // it is what makes one seedling leafier than another. Without it a rosette
  // came out with exactly the same leaf count every time, which is as unlike a
  // species as a nine-fold spread is.
  const phytomers = 0.7 + 0.6 * normalisedTrait(phenotype, 'branch.count')
  const nodes = Math.max(
    6,
    Math.min(34, Math.round(((6 + species.baseline.stature * 1.3) / packing) * phytomers)),
  )

  // Branch angle runs from nearly upright to nearly horizontal. The lower bound
  // is not zero: a branch at zero degrees is indistinguishable from the stem.
  const branchAngle = 12 + normalisedTrait(phenotype, 'branch.angle') * 58

  // Apical dominance is mapped into a band, not used raw.
  //
  // Two loci of equal weight give a normalised value of 0, 0.5 or 1, and used
  // raw those mean every bud growing (an explosion) or none (a pole). Neither
  // is a plant. Real dominance varies within limits: a dense shrub lets most
  // buds out, a young tree very few, and nothing reaches a mathematical
  // extreme.
  //
  // The band is wide at the top on purpose. A first attempt used 0.15 to 0.90,
  // which pulled a tree's 0.90 down to 0.83, and the jacaranda went from 2,700
  // pieces to 14,000. A trunk that keeps nine tenths of its buds suppressed is
  // the whole reason a tree has a trunk, so the upper end has to stay within
  // reach.
  const dominance = 0.08 + aroundSpeciesCentre(species, phenotype, 'branch.apical_dominance') * 0.9

  const form = growthFormOf(phenotype)
  // A rosette leaf leaves the crown rising steeply and then arches out, so
  // the divergence is the ANGLE AT THE BASE, not the average posture.
  const divergenceDeg = form === 'rosette' ? 45 : 55

  const inflorescence = phenotype.discrete['inflorescence.type']?.expressed[0] ?? 'solitary'
  // Phenology decides what the flowers are doing. Before `bloom` a plant has
  // buds at most, and before `bud` it has nothing: a vegetative plant is
  // leaves and stem, which is what most of its year looks like.
  const flowerStage: FlowerStage =
    stage === 'bloom' ? 'bloom' : stage === 'bud' ? 'bud' : 'none'
  // A head is sized by the capitulum; a simple flower by its corolla. Both come
  // from the species through the same baseline field, which is what lets a
  // dandelion's 3 to 5 cm head and a mint's 2.5 mm corolla be the same code.
  const flowerSize =
    phenotype.quantitative['flower.diameter'] ??
    (phenotype.quantitative['petal.length'] ?? 1) * 2

  return {
    nodes,
    pattern,
    divergenceDeg,
    inflorescence,
    flowerSize,
    flowerStage,
    internodeLength: phenotype.quantitative['internode.length'] ?? 1,
    leafLength: phenotype.quantitative['leaf.length'] ?? 1,
    leafWidth: phenotype.quantitative['leaf.width'] ?? 0.5,
    apicalDominance: dominance,
    branchAngle,
  }
}
