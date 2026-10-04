import { describe, expect, it } from 'vitest'
import {
  GENOME_VERSION,
  createGenome,
  deserialiseGenome,
  genomeId,
  migrateGenome,
  serialiseGenome,
  allelePair,
  type Genome,
} from '../src/genome.ts'
import { LOCI } from '../src/loci.ts'

const half = (): Genome => createGenome(LOCI.map(() => [0, 0] as const))

/** A valid allele for locus `i`, offset within that locus's allele count. */
function validAllele(i: number, offset: number): number {
  const locus = LOCI[i]
  if (locus === undefined) throw new Error(`No locus at index ${i}`)
  const count = locus.kind === 'discrete' ? locus.alleles.length : 2
  return (i + offset) % count
}

describe('genome identity', () => {
  it('is stable for the same alleles', () => {
    expect(genomeId(half())).toBe(genomeId(half()))
  })

  it('changes when a single allele changes', () => {
    const a = half()
    const other = createGenome(
      LOCI.map((_, i) => (i === 3 ? ([0, 1] as const) : ([0, 0] as const))),
    )
    expect(genomeId(a)).not.toBe(genomeId(other))
  })

  it('is order sensitive', () => {
    const a = createGenome(
      LOCI.map((_, i) => (i === 0 ? ([1, 0] as const) : ([0, 0] as const))),
    )
    const b = createGenome(
      LOCI.map((_, i) => (i === 0 ? ([0, 1] as const) : ([0, 0] as const))),
    )
    expect(genomeId(a)).not.toBe(genomeId(b))
  })
})

describe('genome serialisation', () => {
  it('round-trips', () => {
    const g = createGenome(
      LOCI.map((_, i) => [validAllele(i, 0), validAllele(i, 1)] as const),
    )
    const back = deserialiseGenome(serialiseGenome(g))
    expect(back).toEqual(g)
    expect(genomeId(back)).toBe(genomeId(g))
  })

  it('is stable text, not key-order dependent', () => {
    const g = half()
    expect(serialiseGenome(deserialiseGenome(serialiseGenome(g)))).toBe(
      serialiseGenome(g),
    )
  })

  it('rejects a genome whose allele count exceeds the catalogue', () => {
    const tooLong = JSON.stringify({
      v: GENOME_VERSION,
      a: [...LOCI.map(() => [0, 0]), [0, 0]],
    })
    expect(() => deserialiseGenome(tooLong)).toThrow(/too many loci/i)
  })

  it('rejects an allele index outside the locus', () => {
    const bad = createGenome(LOCI.map(() => [0, 0] as const))
    const alleles = LOCI.map((locus, i) =>
      i === 0 ? [0, locus.kind === 'discrete' ? locus.alleles.length : 1] : [0, 0],
    )
    const json = JSON.stringify({ ...JSON.parse(serialiseGenome(bad)), a: alleles })
    expect(() => deserialiseGenome(json)).toThrow(/invalid allele/i)
  })
})

describe('genome migration', () => {
  it('fills missing loci deterministically from the genome itself', () => {
    const short = createGenome(LOCI.slice(0, 4).map(() => [0, 0] as const))
    const first = migrateGenome(short)
    const second = migrateGenome(short)
    expect(first.alleles.length).toBe(LOCI.length)
    expect(second).toEqual(first)
  })

  it('is idempotent', () => {
    const short = createGenome(LOCI.slice(0, 4).map(() => [0, 0] as const))
    const once = migrateGenome(short)
    expect(migrateGenome(once)).toEqual(once)
  })

  it('preserves existing alleles exactly', () => {
    const short = createGenome(LOCI.slice(0, 4).map(() => [1, 1] as const))
    const migrated = migrateGenome(short)
    expect(allelesOf(migrated).slice(0, 4)).toEqual([
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ])
  })

  it('stamps the current version', () => {
    const short = createGenome(LOCI.slice(0, 2).map(() => [0, 0] as const))
    expect(migrateGenome(short).version).toBe(GENOME_VERSION)
  })
})

describe('allelePair', () => {
  it('reads the pair for a named locus', () => {
    const g = createGenome(
      LOCI.map((_, i) => (i === 1 ? ([1, 0] as const) : ([0, 0] as const))),
    )
    expect(allelePair(g, LOCI[1]?.id ?? '')).toEqual([1, 0])
  })
})

function allelesOf(g: Genome): number[][] {
  return g.alleles.map((pair) => [pair[0], pair[1]])
}
