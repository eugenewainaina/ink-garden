/**
 * @ink-garden/engine — public API.
 *
 * Pure, dependency-free, isomorphic. Runs identically in browsers, in Node and
 * in Bun. See the spec for the genome (§4) and development (§5).
 *
 * The layers, in order:
 *   genome    genotype: diploid allele pairs, parallel to LOCI
 *   express   genomic phenotype: blend resolution, polygenic sums, epistasis
 *   expressPlant  the plant: species baselines and canalisation resolved
 *   reproduce meiosis, independent assortment, mutation
 */

export {
  LOCI,
  LOCUS_INDEX,
  locusAt,
  locusById,
  locusIndex,
  quantitativeTraits,
  traitMaximum,
  type Architecture,
  type DiscreteLocus,
  type Locus,
  type LocusKind,
  type QuantitativeLocus,
} from './loci.ts'

export { hash32, pickWeighted, rngFrom } from './rng.ts'

export {
  GENOME_VERSION,
  allelePair,
  createGenome,
  deserialiseGenome,
  founderGenome,
  genomeId,
  migrateGenome,
  serialiseGenome,
  type Allele,
  type Genome,
} from './genome.ts'

export {
  DANDELION,
  JACARANDA,
  ROSEMARY,
  SPECIES,
  SPEARMINT,
  defaultDistribution,
  type Lifecycle,
  type PhenotypeBaseline,
  type SpeciesTemplate,
} from './species.ts'

export {
  BASELINE_SPREAD,
  DERIVED_TRAITS,
  express,
  expressMutable,
  expressPlant,
  resolveDiscrete,
  type DiscreteTrait,
  type MutablePhenotype,
  type Phenotype,
} from './phenotype.ts'

export { EPISTASIS, applyEpistasis, type EpistasisRule } from './epistasis.ts'

export { meiosis, mutateAllele, reproduce } from './reproduce.ts'

// --- Development: growth, placement, geometry ---

export { grow, growRosette } from './dev/grow.ts'
export { develop, type DevelopInput } from './dev/develop.ts'
export { sceneFromStructure, type Scene, type SceneShape } from './dev/geometry.ts'
export { placeOrgans, layoutShoot, type PlacedOrgan, type Segment } from './dev/layout.ts'
export {
  LEAF_MARGINS,
  LEAF_OUTLINES,
  laminaProfile,
  leafOutline,
  marginFactor,
  type LeafGeometry,
  type LeafShape,
  type MarginTerm,
  type Point,
  type ProfileShape,
} from './dev/leaf.ts'
export { shootGeometry, growthFormOf, type GrowthForm, type ShootGeometry } from './dev/shoot.ts'
export { buildShoot, growPhytomers, type Branch, type Shoot, type ShootConfig } from './dev/meristem.ts'
export {
  GOLDEN_ANGLE,
  leavesPerNode,
  nextBudAngle,
  phyllotaxisAngle,
  projectLeaf,
  type Phyllotaxis,
} from './dev/phyllotaxis.ts'
export {
  countOrgans,
  describeStructure,
  flatten,
  heightOf,
  leafAreaOf,
  makeOrgan,
  type Organ,
  type OrganKind,
  type Structure,
  type Transform,
} from './dev/structure.ts'
export { phenologyAt, phenologyOver, type Phenology, type Stage } from './dev/phenology.ts'
export { accumulateThermal, degreeDays, type ThermalState } from './dev/thermal.ts'
export { dayLengthHours } from './dev/solar.ts'
export { seasonalDay, weatherSeries, type WeatherDay } from './dev/weather.ts'

