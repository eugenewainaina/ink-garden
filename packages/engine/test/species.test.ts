import { describe, expect, it } from 'vitest'
import { founderGenome, genomeId } from '../src/genome.ts'
import { LOCI, locusAt, locusIndex } from '../src/loci.ts'
import { expressPlant } from '../src/phenotype.ts'
import {
  DANDELION,
  JACARANDA,
  ROSEMARY,
  SPECIES,
  SPEARMINT,
  defaultDistribution,
  type SpeciesTemplate,
} from '../src/species.ts'

/** The plant, not just the genome: species assertions need the baseline. */
function phenotypeFor(template: SpeciesTemplate, name: string) {
  return expressPlant(founderGenome(template, name), template)
}

const fixture: SpeciesTemplate = {
  id: 'fixture',
  commonName: 'Fixture',
  binomial: 'Testus fixturus',
  lineage: 'Testus',
  lifecycle: 'perennial',
  daysToBloom: 40,
  baseline: {
    petalCount: 5,
    stature: 4,
    leafSize: 3,
    flowerSize: 2,
    stemThickness: 1,
    thermalBase: 5,
    thermalConstant: 700,
    criticalDaylength: 13,
    vernalizationHours: 100,
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

describe('species baselines', () => {
  it('gives every species a complete, positive baseline', () => {
    for (const template of SPECIES) {
      const b = template.baseline
      for (const [field, value] of Object.entries(b)) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value, `${template.id}.${field}`).toBeGreaterThan(0)
      }
    }
  })

  it('makes jacaranda a tree and rosemary a shrub from the same genome', () => {
    const genome = founderGenome(JACARANDA, 'same')
    const jac = expressPlant(genome, JACARANDA)
    const rose = expressPlant(genome, ROSEMARY)
    const jacHeight = jac.quantitative['height'] ?? 0
    const roseHeight = rose.quantitative['height'] ?? 0
    expect(jacHeight).toBeGreaterThan(roseHeight * 4)
  })

  it('pins petal number to each species baseline', () => {
    const expected: ReadonlyArray<readonly [SpeciesTemplate, number]> = [
      [ROSEMARY, 5],
      [DANDELION, 50],
      [SPEARMINT, 5],
      [JACARANDA, 5],
    ]
    for (const [template, petals] of expected) {
      // Across many plants, not one: a single sample can happen to be a
      // double flower, and asserting on one would make this test a coin flip.
      const counts = new Map<number, number>()
      const n = 200
      for (let i = 0; i < n; i += 1) {
        const value =
          phenotypeFor(template, `${template.id}-petal-${i}`).quantitative[
            'petal.count'
          ] ?? -1
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
      const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      if (modal === undefined) throw new Error(`no samples for ${template.id}`)

      // The species value is the norm.
      expect(modal[0], template.id).toBeCloseTo(petals, 6)
      // Doubling is a rare homeotic mutation, so the doubled value is the
      // exception rather than the rule.
      expect(modal[1] / n, template.id).toBeGreaterThan(0.8)
    }
  })

  it('keeps saturation and lightness physical for every species', () => {
    for (const template of SPECIES) {
      for (let i = 0; i < 40; i += 1) {
        const p = phenotypeFor(template, `${template.id}-${i}`)
        const sat = p.quantitative['pigment.saturation'] ?? 0
        const lit = p.quantitative['pigment.lightness'] ?? 0
        const hue = p.quantitative['pigment.hue'] ?? 0
        expect(sat).toBeGreaterThanOrEqual(0)
        expect(sat).toBeLessThanOrEqual(1)
        expect(lit).toBeGreaterThanOrEqual(0)
        expect(lit).toBeLessThanOrEqual(1)
        expect(hue).toBeGreaterThanOrEqual(0)
        expect(hue).toBeLessThan(360)
      }
    }
  })

  it('makes rosemary read as a thorny, narrow-leaved, blue-flowered shrub', () => {
    let thorned = 0
    let needleLike = 0
    let violetOrMagenta = 0
    const n = 200
    for (let i = 0; i < n; i += 1) {
      const p = phenotypeFor(ROSEMARY, `rosemary-${i}`)
      if (p.discrete['thorn.presence']?.winner === 1) thorned += 1
      if (p.discrete['leaf.form']?.winner === 0) needleLike += 1
      const branch = p.discrete['pigment.anthocyanidin']?.winner ?? 0
      if (branch === 2 || branch === 3) violetOrMagenta += 1
    }
    expect(thorned / n).toBeGreaterThan(0.8)
    expect(needleLike / n).toBeGreaterThan(0.8)
    expect(violetOrMagenta / n).toBeGreaterThan(0.6)
  })

  it('makes dandelion a head-flowered rosette', () => {
    let heads = 0
    let yellow = 0
    const n = 200
    for (let i = 0; i < n; i += 1) {
      const p = phenotypeFor(DANDELION, `dandelion-${i}`)
      if (p.discrete['inflorescence.type']?.winner === 6) heads += 1
      const car = p.discrete['pigment.carotenoid']?.winner ?? 0
      const anth = p.discrete['pigment.anthocyanidin']?.winner ?? 0
      if (anth === 0 && car >= 1) yellow += 1
    }
    expect(heads / n).toBeGreaterThan(0.9)
    expect(yellow / n).toBeGreaterThan(0.7)
  })

  it('makes spearmint an opposite-leaved herb', () => {
    let opposite = 0
    let thornless = 0
    const n = 200
    for (let i = 0; i < n; i += 1) {
      const p = phenotypeFor(SPEARMINT, `mint-${i}`)
      if (p.discrete['phyllotaxis.pattern']?.winner === 1) opposite += 1
      if (p.discrete['thorn.presence']?.winner === 0) thornless += 1
    }
    expect(opposite / n).toBeGreaterThan(0.85)
    expect(thornless).toBe(n)
  })

  it('makes jacaranda a thornless bipinnate tree with panicles', () => {
    let thornless = 0
    let bipinnate = 0
    let panicle = 0
    const n = 200
    for (let i = 0; i < n; i += 1) {
      const p = phenotypeFor(JACARANDA, `jacaranda-${i}`)
      if (p.discrete['thorn.presence']?.winner === 0) thornless += 1
      if (p.discrete['leaf.form']?.winner === 2) bipinnate += 1
      if (p.discrete['inflorescence.type']?.winner === 3) panicle += 1
    }
    expect(thornless / n).toBeGreaterThan(0.9)
    expect(bipinnate / n).toBeGreaterThan(0.9)
    expect(panicle / n).toBeGreaterThan(0.85)
  })

  it('gives the tree a far larger thermal budget than the herb', () => {
    // A jacaranda takes years to flower from seed; a dandelion takes weeks.
    expect(JACARANDA.baseline.thermalConstant).toBeGreaterThan(
      DANDELION.baseline.thermalConstant * 10,
    )
    expect(SPEARMINT.baseline.thermalConstant).toBeGreaterThan(
      DANDELION.baseline.thermalConstant,
    )
  })
})
