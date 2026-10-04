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
