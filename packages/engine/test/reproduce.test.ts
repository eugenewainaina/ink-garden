import { describe, expect, it } from 'vitest'
import { GENOME_VERSION, createGenome, genomeId, type Genome } from '../src/genome.ts'
import { LOCI, locusAt, locusIndex } from '../src/loci.ts'
import { meiosis, mutateAllele, reproduce } from '../src/reproduce.ts'

function patterned(offset: number): Genome {
  return createGenome(
    LOCI.map((locus, i) => {
      const count = locus.kind === 'discrete' ? locus.alleles.length : 2
      return [(i + offset) % count, (i + offset + 1) % count] as const
    }),
  )
}

describe('meiosis', () => {
  it('returns exactly one allele per locus', () => {
    expect(meiosis(patterned(0), 'Amara', 0).length).toBe(LOCI.length)
  })

  it('picks an allele the parent actually carries', () => {
    const parent = patterned(0)
    meiosis(parent, 'Amara', 0).forEach((allele, i) => {
      const pair = parent.alleles[i]
      if (pair === undefined) throw new Error('missing pair')
      expect([pair[0], pair[1]]).toContain(allele)
    })
  })

  it('is deterministic for the same child name and side', () => {
    const parent = patterned(0)
    expect(meiosis(parent, 'Amara', 0)).toEqual(meiosis(parent, 'Amara', 0))
  })

  it('differs between child names', () => {
    const parent = patterned(0)
    expect(meiosis(parent, 'Amara', 0)).not.toEqual(meiosis(parent, 'Kofi', 0))
  })

  it('differs between sides, so selfing still recombines', () => {
    const parent = patterned(0)
    expect(meiosis(parent, 'Amara', 0)).not.toEqual(meiosis(parent, 'Amara', 1))
  })

  it('segregates both copies across many draws', () => {
    const parent = patterned(0)
    const seen = new Set<number>()
    for (let i = 0; i < 80; i += 1) {
      seen.add(meiosis(parent, `child-${i}`, 0)[0] ?? -1)
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('mutateAllele', () => {
  it('leaves the allele alone when r is above the mutation rate', () => {
    const locus = locusAt(locusIndex('thorn.presence'))
    expect(mutateAllele(locus, 1, 0.99)).toBe(1)
  })

  it('changes the allele when r is below the mutation rate', () => {
    const locus = locusAt(locusIndex('thorn.presence'))
    expect(mutateAllele(locus, 1, 0)).not.toBe(1)
  })

  it('always returns a valid allele, for every locus', () => {
    for (let i = 0; i < LOCI.length; i += 1) {
      const locus = locusAt(i)
      const count = locus.kind === 'discrete' ? locus.alleles.length : 2
      for (const r of [0, 0.0001, 0.5, 0.999]) {
        const result = mutateAllele(locus, 0, r)
        expect(Number.isInteger(result)).toBe(true)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThan(count)
      }
    }
  })

  it('is deterministic', () => {
    const locus = locusAt(locusIndex('pigment.anthocyanidin'))
    expect(mutateAllele(locus, 0, 0.0001)).toBe(mutateAllele(locus, 0, 0.0001))
  })

  it('fires at roughly the configured rate', () => {
    const locus = locusAt(locusIndex('thorn.presence'))
    const n = 100_000
    let mutations = 0
    for (let i = 0; i < n; i += 1) {
      if (mutateAllele(locus, 0, (i + 0.5) / n) !== 0) mutations += 1
    }
    expect(mutations / n).toBeGreaterThan(locus.mutation * 0.8)
    expect(mutations / n).toBeLessThan(locus.mutation * 1.2)
  })
})

describe('reproduce', () => {
  it('is deterministic in the child name and both parents', () => {
    const a = patterned(0)
    const b = patterned(2)
    expect(reproduce('Amara', a, b)).toEqual(reproduce('Amara', a, b))
    expect(genomeId(reproduce('Amara', a, b))).toBe(
      genomeId(reproduce('Amara', a, b)),
    )
  })

  it('produces a different child for a different name', () => {
    const a = patterned(0)
    const b = patterned(2)
    expect(reproduce('Amara', a, b)).not.toEqual(reproduce('Kofi', a, b))
  })

  it('produces one valid pair per locus', () => {
    const child = reproduce('Amara', patterned(0), patterned(2))
    expect(child.alleles.length).toBe(LOCI.length)
    child.alleles.forEach((pair, i) => {
      const locus = locusAt(i)
      const count = locus.kind === 'discrete' ? locus.alleles.length : 2
      for (const allele of pair) {
        expect(allele).toBeGreaterThanOrEqual(0)
        expect(allele).toBeLessThan(count)
      }
    })
  })

  it('recombines, rather than copying either parent', () => {
    const a = patterned(0)
    const b = patterned(2)
    const child = reproduce('Amara', a, b)
    expect(genomeId(child)).not.toBe(genomeId(a))
    expect(genomeId(child)).not.toBe(genomeId(b))
  })

  it('recombines even when both parents are the same genome', () => {
    const a = patterned(0)
    const selfed = reproduce('Amara', a, a)
    expect(selfed.alleles.length).toBe(LOCI.length)
    expect(genomeId(selfed)).not.toBe(genomeId(a))
  })

  it('keeps every child a valid genome', () => {
    const a = patterned(0)
    const b = patterned(3)
    for (let i = 0; i < 40; i += 1) {
      const child = reproduce(`g-${i}`, a, b)
      expect(child.alleles.length).toBe(LOCI.length)
      expect(child.version).toBe(GENOME_VERSION)
    }
  })
})
