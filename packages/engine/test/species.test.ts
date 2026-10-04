import { describe, expect, it } from 'vitest'
import { founderGenome, genomeId } from '../src/genome.ts'
import { LOCI, locusAt, locusIndex } from '../src/loci.ts'
import { defaultDistribution, type SpeciesTemplate } from '../src/species.ts'

const fixture: SpeciesTemplate = {
  id: 'fixture',
  commonName: 'Fixture',
  binomial: 'Testus fixturus',
  lineage: 'Testus',
  lifecycle: 'perennial',
  daysToBloom: 40,
  thermalBase: 5,
  thermalConstant: 700,
  distributions: {
    'thorn.presence': [0.95, 0.05],
    'leaf.form': [0, 1, 0, 0, 0],
    'petal.count.a': [0.2, 0.8],
  },
}

describe('defaultDistribution', () => {
  it('is uniform over the allele count', () => {
    const five = LOCI.find((l) => l.kind === 'discrete' && l.alleles.length === 5)
    if (five === undefined) throw new Error('expected a five-allele locus in the catalogue')
    const dist = defaultDistribution(five)
    expect(dist.length).toBe(5)
    for (const p of dist) expect(p).toBeCloseTo(0.2, 10)
  })

  it('is binary for quantitative loci', () => {
    const quant = LOCI.find((l) => l.kind === 'quantitative')
    if (quant === undefined) throw new Error('expected a quantitative locus')
    expect(defaultDistribution(quant)).toEqual([0.5, 0.5])
  })
})

describe('founderGenome', () => {
  it('is deterministic for a name and template', () => {
    const a = founderGenome(fixture, 'Amara')
    const b = founderGenome(fixture, 'Amara')
    expect(a).toEqual(b)
    expect(genomeId(a)).toBe(genomeId(b))
  })

  it('differs between names', () => {
    expect(genomeId(founderGenome(fixture, 'Amara'))).not.toBe(
      genomeId(founderGenome(fixture, 'Kofi')),
    )
  })

  it('produces one valid pair per locus', () => {
    const g = founderGenome(fixture, 'Amara')
    expect(g.alleles.length).toBe(LOCI.length)
    g.alleles.forEach((pair, i) => {
      const locus = locusAt(i)
      const count = locus.kind === 'discrete' ? locus.alleles.length : 2
      for (const allele of pair) {
        expect(allele).toBeGreaterThanOrEqual(0)
        expect(allele).toBeLessThan(count)
      }
    })
  })

  it('respects explicit distributions', () => {
    let thornless = 0
    const n = 400
    for (let i = 0; i < n; i += 1) {
      const g = founderGenome(fixture, `sample-${i}`)
      const pair = g.alleles[locusIndex('thorn.presence')] ?? [0, 0]
      if (pair[0] === 0 && pair[1] === 0) thornless += 1
    }
    // p(both copies 0) = 0.95^2 = 0.9025
    expect(thornless / n).toBeGreaterThan(0.85)
    expect(thornless / n).toBeLessThan(0.95)
  })

  it('is tightly clustered for a near-deterministic locus', () => {
    let pinnate = 0
    const n = 400
    for (let i = 0; i < n; i += 1) {
      const g = founderGenome(fixture, `leaf-${i}`)
      const pair = g.alleles[locusIndex('leaf.form')] ?? [0, 0]
      if (pair[0] === 1 && pair[1] === 1) pinnate += 1
    }
    expect(pinnate).toBe(n)
  })

  it('falls back to a default for unspecified loci', () => {
    let sawOne = false
    let sawZero = false
    for (let i = 0; i < 200 && !(sawOne && sawZero); i += 1) {
      const g = founderGenome(fixture, `fallback-${i}`)
      const pair = g.alleles[locusIndex('flower.doubling')] ?? [0, 0]
      if (pair[0] === 1 || pair[1] === 1) sawOne = true
      if (pair[0] === 0 || pair[1] === 0) sawZero = true
    }
    expect(sawOne).toBe(true)
    expect(sawZero).toBe(true)
  })
})
