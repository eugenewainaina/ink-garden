import {
  createGenome,
  genomeId,
  type Allele,
  type Genome,
} from './genome.ts'
import { LOCI, locusAt, type Locus } from './loci.ts'
import { hash32, rngFrom } from './rng.ts'

/**
 * One haploid contribution from a parent.
 *
 * Loci assort independently: they do not co-segregate as though they shared a
 * chromosome (linkage is deferred, spec §18). `side` salts the randomness so
 * that selfing still recombines rather than cloning.
 */
export function meiosis(
  parent: Genome,
  childName: string,
  side: 0 | 1,
): readonly Allele[] {
  const parentId = genomeId(parent)
  const haplotype: Allele[] = []
  for (let index = 0; index < LOCI.length; index += 1) {
    const locus = locusAt(index)
    const pair = parent.alleles[index]
    if (pair === undefined) throw new Error(`Parent is missing locus ${locus.id}`)
    const r = rngFrom(`${childName}|${parentId}|${side}|${locus.id}`)
    haplotype.push(r() < 0.5 ? pair[0] : pair[1])
  }
  return haplotype
}

/**
 * Mutate one allele copy. `r` in [0, 1) is compared against the locus rate, so
 * this is deterministic given `r`.
 *
 * The direction of the mutation is itself derived from a hash of the locus and
 * the current allele, so it is reproducible rather than random. That matters
 * because it means a mutation is a property of the plant, not of the moment it
 * was computed.
 */
export function mutateAllele(locus: Locus, allele: Allele, r: number): Allele {
  if (r >= locus.mutation) return allele
  const count = locus.kind === 'discrete' ? locus.alleles.length : 2
  if (count <= 1) return 0
  const step = hash32(`${locus.id}|${allele}`) % 2 === 0 ? 1 : count - 1
  return (allele + step) % count
}

/**
 * Two parents and a name produce a child genome. Pure: the same three inputs
 * always produce the same plant, forever, on every device.
 *
 * The child's *name* salts meiosis, so naming a child is choosing a roll of
 * the genetic dice from the two parents. Two flowers named the same from the
 * same parents are identical; rename one and it recombines differently.
 */
export function reproduce(
  childName: string,
  parentA: Genome,
  parentB: Genome,
): Genome {
  const fromA = meiosis(parentA, childName, 0)
  const fromB = meiosis(parentB, childName, 1)

  const alleles: (readonly [Allele, Allele])[] = []
  for (let index = 0; index < LOCI.length; index += 1) {
    const locus = locusAt(index)
    const a = fromA[index]
    const b = fromB[index]
    if (a === undefined || b === undefined) {
      throw new Error(`Meiosis produced no allele for locus ${locus.id}`)
    }
    const ra = rngFrom(`${childName}|mutate|0|${locus.id}`)
    const rb = rngFrom(`${childName}|mutate|1|${locus.id}`)
    alleles.push([
      mutateAllele(locus, a, ra()),
      mutateAllele(locus, b, rb()),
    ] as const)
  }

  return createGenome(alleles)
}
