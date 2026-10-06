import { describe, expect, it } from 'vitest'
import { createGenome, type Genome } from '../src/genome.ts'
import { LOCI } from '../src/loci.ts'
import { BASELINE_SPREAD, expressPlant } from '../src/phenotype.ts'
import type { SpeciesTemplate } from '../src/species.ts'
import { referenceGenome, setAlleleByName, setQuantitative } from './helpers.ts'

const base = (petalCount: number, stature: number): SpeciesTemplate => ({
  id: 'test',
  commonName: 'Test',
  binomial: 'Testus testus',
  lineage: 'Testus',
  lifecycle: 'perennial',
  daysToBloom: 60,
  baseline: {
    petalCount,
    stature,
    leafSize: 3,
    internodeScale: 1,
    leafAspect: 3,
    leafHue: 100,
    leafSaturation: 0.4,
    leafLightness: 0.35,
    flowerSize: 2,
    stemThickness: 1,
    thermalBase: 5,
    thermalConstant: 600,
    criticalDaylength: 13,
    vernalizationHours: 100,
  },
  distributions: {},
})

const flat = (): Genome => referenceGenome()

/** Canalised is the normal state and dominant, so a heterozygote is canalised. */
const canalised = (g: Genome): Genome =>
  setAlleleByName(g, 'flower.canalisation', 'canalised', 'canalised')
const decanalised = (g: Genome): Genome =>
  setAlleleByName(g, 'flower.canalisation', 'decanalised', 'decanalised')
const doubled = (g: Genome): Genome =>
  setAlleleByName(g, 'flower.doubling', 'double', 'double')

describe('canalisation', () => {
  it('pins petal number to the species value while canalisation is intact', () => {
    const template = base(5, 4)
    for (const variance of [0, 1, 2]) {
      const g = canalised(setQuantitative(flat(), 'petal.variance.a', variance, variance))
      expect(expressPlant(g, template).quantitative['petal.count']).toBeCloseTo(5, 10)
    }
  })

  it('expresses the hidden variation once canalisation is lost', () => {
    const template = base(5, 4)
    const silent = decanalised(flat())
    const full = decanalised(setQuantitative(flat(), 'petal.variance.a', 1, 1))
    const also = decanalised(setQuantitative(flat(), 'petal.variance.b', 1, 1))

    const zero = expressPlant(silent, template).quantitative['petal.count'] ?? -1
    const some = expressPlant(full, template).quantitative['petal.count'] ?? -1
    const more = expressPlant(also, template).quantitative['petal.count'] ?? -1

    expect(zero).not.toBe(some)
    expect(some).not.toBe(more)
  })

  it('runs from the species value down to zero as hidden variation grows', () => {
    const template = base(5, 4)

    // Decanalisation reveals variation; with none to reveal, the flower is
    // normal. This is the point: canalisation suppresses, it does not invent.
    const none = expressPlant(decanalised(flat()), template)
    expect(none.quantitative['petal.count']).toBeCloseTo(5, 10)

    // Maximum cryptic variation loses every petal, exactly as Cardamine
    // hirsuta ranges from four down to zero.
    let maxed = setQuantitative(flat(), 'petal.variance.a', 1, 1)
    maxed = setQuantitative(maxed, 'petal.variance.b', 1, 1)
    const zero = expressPlant(decanalised(maxed), template)
    expect(zero.quantitative['petal.count']).toBeCloseTo(0, 10)

    const partial = decanalised(setQuantitative(flat(), 'petal.variance.a', 1, 1))
    const value = expressPlant(partial, template).quantitative['petal.count'] ?? -1
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThan(5)
  })

  it('takes the species petal count, not a universal one', () => {
    const six = expressPlant(canalised(flat()), base(6, 4))
    const four = expressPlant(canalised(flat()), base(4, 4))
    expect(six.quantitative['petal.count']).toBeCloseTo(6, 10)
    expect(four.quantitative['petal.count']).toBeCloseTo(4, 10)
  })
})

describe('the doubling mutation', () => {
  it('multiplies the canalised petal count', () => {
    const template = base(5, 4)
    const plant = canalised(doubled(flat()))
    expect(expressPlant(plant, template).quantitative['petal.count']).toBeCloseTo(
      9.5,
      10,
    )
  })

  it('also costs fertility, which lives in the epistasis layer', () => {
    const template = base(5, 4)
    const doublePlant = canalised(doubled(flat()))
    const singlePlant = canalised(flat())
    expect(
      expressPlant(doublePlant, template).quantitative['flower.fertility'],
    ).toBeLessThan(
      expressPlant(singlePlant, template).quantitative['flower.fertility'] ?? 0,
    )
  })
})

describe('species baselines scale quantitative traits', () => {
  it('makes a tree taller than a shrub from the same genome', () => {
    const g = flat()
    const shrub = expressPlant(g, base(5, 1))
    const tree = expressPlant(g, base(5, 20))
    const shrubHeight = shrub.quantitative['height'] ?? 0
    const treeHeight = tree.quantitative['height'] ?? 0
    expect(treeHeight).toBeGreaterThan(shrubHeight * 10)
  })

  it('keeps every scaled trait within the declared spread of its baseline', () => {
    const template = base(5, 4)
    for (let i = 0; i < 40; i += 1) {
      const alleles = LOCI.map((_, index) => {
        const locus = LOCI[index]
        const count = locus?.kind === 'discrete' ? locus.alleles.length : 2
        return [i % count, (i + 1) % count] as const
      })
      const p = expressPlant(createGenome(alleles), template)
      const height = p.quantitative['height'] ?? 0
      expect(height).toBeGreaterThanOrEqual(template.baseline.stature * (1 - BASELINE_SPREAD) - 1e-9)
      expect(height).toBeLessThanOrEqual(template.baseline.stature * (1 + BASELINE_SPREAD) + 1e-9)
    }
  })

  it('is deterministic', () => {
    const template = base(5, 4)
    const g = decanalised(setQuantitative(flat(), 'petal.variance.a', 1, 0))
    expect(expressPlant(g, template)).toEqual(expressPlant(g, template))
  })
})
