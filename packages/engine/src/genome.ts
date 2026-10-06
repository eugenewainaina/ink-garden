import { LOCI, locusAt, locusIndex, type Locus } from './loci.ts'
import { hash32, pickWeighted, rngFrom } from './rng.ts'
import { defaultDistribution, type SpeciesTemplate } from './species.ts'

export const GENOME_VERSION = 4

export type Allele = number

/** Diploid: one [copyA, copyB] pair per locus, parallel to LOCI. */
export interface Genome {
  readonly version: number
  readonly alleles: readonly (readonly [Allele, Allele])[]
}

export function createGenome(
  alleles: readonly (readonly [Allele, Allele])[],
): Genome {
  return { version: GENOME_VERSION, alleles: [...alleles] }
}

export function allelePair(
  genome: Genome,
  locusId: string,
): readonly [Allele, Allele] {
  const pair = genome.alleles[locusIndex(locusId)]
  if (pair === undefined) throw new Error(`No alleles for locus ${locusId}`)
  return pair
}

/** Allele count for a locus: named alleles, or 2 for a quantitative locus. */
function alleleCount(locus: Locus): number {
  return locus.kind === 'discrete' ? locus.alleles.length : 2
}

function assertAllele(locus: Locus, allele: Allele, where: string): void {
  if (!Number.isInteger(allele) || allele < 0 || allele >= alleleCount(locus)) {
    throw new Error(`Invalid allele ${allele} at ${where} (${locus.id})`)
  }
}

/** A stable identity for a genome, used as the salt in meiosis. */
export function genomeId(genome: Genome): string {
  let s = `v${genome.version}`
  for (const [a, b] of genome.alleles) s += `:${a}${b}`
  return hash32(s).toString(16).padStart(8, '0')
}

export function serialiseGenome(genome: Genome): string {
  return JSON.stringify({
    v: genome.version,
    a: genome.alleles.map(([a, b]) => [a, b]),
  })
}

export function deserialiseGenome(json: string): Genome {
  const parsed: unknown = JSON.parse(json)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Genome JSON is not an object')
  }
  const record = parsed as { v?: unknown; a?: unknown }
  const version = typeof record.v === 'number' ? record.v : GENOME_VERSION
  if (!Array.isArray(record.a)) throw new Error('Genome JSON has no allele array')
  if (record.a.length > LOCI.length) throw new Error('Genome has too many loci')

  const alleles = record.a.map((raw, i) => {
    if (!Array.isArray(raw) || raw.length !== 2) {
      throw new Error(`Invalid allele pair at locus ${i}`)
    }
    const locus = locusAt(i)
    const a = raw[0] as number
    const b = raw[1] as number
    assertAllele(locus, a, 'copy 0')
    assertAllele(locus, b, 'copy 1')
    return [a, b] as const
  })

  return { version, alleles }
}

/**
 * Fill loci added since a genome was created. New alleles are derived from the
 * genome's own identity, so migration is deterministic and repeatable: an old
 * plant does not change its appearance each time it is loaded.
 */
export function migrateGenome(genome: Genome): Genome {
  if (genome.alleles.length === LOCI.length && genome.version === GENOME_VERSION) {
    return genome
  }
  const alleles: (readonly [Allele, Allele])[] = genome.alleles.map((pair, i) => {
    const locus = locusAt(i)
    assertAllele(locus, pair[0], 'copy 0')
    assertAllele(locus, pair[1], 'copy 1')
    return [pair[0], pair[1]] as const
  })

  // Fill with the REFERENCE allele, not a random one.
  //
  // The first version drew new alleles uniformly. That gave every migrated
  // plant an arbitrary shape the moment a locus was added, which contradicts
  // the rule that nothing is ever lost: a plant the user has known for a year
  // should not become a different plant because the genome grew. The reference
  // allele is chosen to mean "as before" for exactly this reason, so padding
  // with it leaves the plant looking the way it did.
  for (let i = alleles.length; i < LOCI.length; i += 1) {
    const locus = locusAt(i)
    const reference = locus.kind === 'discrete' ? (locus.referenceAllele ?? 0) : 0
    alleles.push([reference, reference] as const)
  }

  return { version: GENOME_VERSION, alleles }
}

/**
 * Express a founding plant: each allele copy is drawn from the species
 * distribution for its locus, using randomness seeded by the plant's name.
 * Bounded variance comes from the distribution's shape, so a species with a
 * narrow distribution produces near-identical founders.
 */
export function founderGenome(
  template: SpeciesTemplate,
  seed: string,
): Genome {
  const alleles: (readonly [Allele, Allele])[] = []
  for (const locus of LOCI) {
    const declared = template.distributions[locus.id]
    const distribution = declared ?? defaultDistribution(locus)
    const count = alleleCount(locus)
    if (distribution.length !== count) {
      throw new Error(
        `Species ${template.id}: distribution for ${locus.id} has ` +
          `${distribution.length} entries, expected ${count}`,
      )
    }
    const r = rngFrom(`${seed}|${template.id}|${locus.id}`)
    const a = pickWeighted(distribution, r())
    const b = pickWeighted(distribution, r())
    alleles.push([a, b] as const)
  }
  return { version: GENOME_VERSION, alleles }
}
