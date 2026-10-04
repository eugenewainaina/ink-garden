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
  baseline: {
    petalCount: 5,
    stature: 4,
    leafSize: 3,
    flowerSize: 2,
    stemThickness: 1,
  },
  distributions: {
    'thorn.presence': [0.95, 0.05],
    'leaf.form': [0, 1, 0, 0, 0],
    'petal.count.a': [0.2, 0.8],
  },
}

describe('defaultDistribution', () => {
  it('is reference-biased for a canalised locus', () => {
    const canalised = LOCI.find(
      (l) =>
        l.kind === 'discrete' &&
        l.architecture === 'canalised' &&
        l.alleles.length === 5,
    )
    if (canalised === undefined) {
      throw new Error('expected a five-allele canalised locus')
    }
    const dist = defaultDistribution(canalised)
    expect(dist.length).toBe(5)
    expect(dist[0]).toBeCloseTo(0.99, 10)
    for (const p of dist.slice(1)) expect(p).toBeCloseTo(0.0025, 10)
  })

  it('keeps a homeotic mutant uncommon', () => {
    const homeotic = LOCI.find(
      (l) => l.kind === 'discrete' && l.architecture === 'homeotic',
    )
    if (homeotic === undefined) throw new Error('expected a homeotic locus')
    expect(defaultDistribution(homeotic)[0]).toBeGreaterThan(0.9)
  })

  it('gives a polymorphic locus real standing variation', () => {
    const poly = LOCI.find(
      (l) => l.kind === 'discrete' && l.architecture === 'polymorphic',
    )
    if (poly === undefined) throw new Error('expected a polymorphic locus')
    expect(defaultDistribution(poly)[0]).toBeCloseTo(0.5, 10)
  })

  it('biases quantitative loci mildly toward the reference allele', () => {
    const quant = LOCI.find((l) => l.kind === 'quantitative')
    if (quant === undefined) throw new Error('expected a quantitative locus')
    expect(defaultDistribution(quant)).toEqual([0.55, 0.45])
  })

  it('matches every locus allele count and sums to one', () => {
    for (const locus of LOCI) {
      const dist = defaultDistribution(locus)
      const count = locus.kind === 'discrete' ? locus.alleles.length : 2
      expect(dist.length).toBe(count)
      expect(dist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    }
  })

  it('makes green petals rare by default, which was the bug', () => {
    // A first pass with uniform defaults made roughly 75% of wild plants carry
    // petal chlorophyll and come out green. Real green flowers are uncommon in
    // nature (Li et al. 2026, Hortic Res).
    const locus = LOCI.find((l) => l.id === 'pigment.petal.chlorophyll')
    if (locus === undefined || locus.kind !== 'discrete') {
      throw new Error('expected pigment.petal.chlorophyll')
    }
    const dist = defaultDistribution(locus)
    const carrierProbability = 1 - (1 - (dist[1] ?? 0)) ** 2
    expect(carrierProbability).toBeLessThan(0.1)
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
