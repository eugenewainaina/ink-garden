import { describe, expect, it } from 'vitest'
import {
  LOCI,
  LOCUS_INDEX,
  locusAt,
  locusById,
  locusIndex,
  quantitativeTraits,
} from '../src/loci.ts'
import { founderGenome } from '../src/genome.ts'
import { express } from '../src/phenotype.ts'
import { ROSEMARY } from '../src/species.ts'

describe('the locus catalogue', () => {
  it('has unique ids', () => {
    const ids = LOCI.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('indexes every locus at its array position', () => {
    expect(LOCUS_INDEX.size).toBe(LOCI.length)
    LOCI.forEach((locus, i) => {
      expect(locusIndex(locus.id)).toBe(i)
      expect(locusAt(i)).toBe(locus)
    })
  })

  it('gives every discrete locus at least two named alleles', () => {
    for (const locus of LOCI) {
      if (locus.kind !== 'discrete') continue
      expect(locus.alleles.length).toBeGreaterThanOrEqual(2)
      expect(new Set(locus.alleles).size).toBe(locus.alleles.length)
    }
  })

  it('keeps blend and mutation inside their ranges', () => {
    for (const locus of LOCI) {
      if (locus.kind === 'discrete') {
        expect(locus.blend).toBeGreaterThanOrEqual(0)
        expect(locus.blend).toBeLessThanOrEqual(1)
      }
      expect(locus.mutation).toBeGreaterThanOrEqual(0)
      expect(locus.mutation).toBeLessThan(1)
    }
  })

  it('gives every quantitative locus a trait and a non-zero weight', () => {
    for (const locus of LOCI) {
      if (locus.kind !== 'quantitative') continue
      expect(locus.trait.length).toBeGreaterThan(0)
      expect(locus.weight).not.toBe(0)
    }
  })

  it('covers the modules the spec requires', () => {
    const ids = LOCI.map((l) => l.id)
    for (const required of [
      'flower.doubling',
      'flower.symmetry',
      'inflorescence.type',
      'leaf.form',
      'thorn.presence',
      'pigment.anthocyanidin',
      'pigment.carotenoid',
      'pigment.petal.chlorophyll',
      'photoperiod.response',
      'lifecycle',
      'flower.canalisation',
    ]) {
      expect(ids).toContain(required)
    }
  })

  it('lists each quantitative trait once', () => {
    const traits = quantitativeTraits()
    expect(new Set(traits).size).toBe(traits.length)
    expect(traits).toContain('petal.variance')
    expect(traits).toContain('height')
    // petal.count is canalised, not polygenic, so it must not be a
    // locus-contributed trait at all.
    expect(traits).not.toContain('petal.count')
  })

  it('declares an architecture for every discrete locus', () => {
    for (const locus of LOCI) {
      if (locus.kind !== 'discrete') continue
      expect(['canalised', 'polymorphic', 'homeotic']).toContain(locus.architecture)
    }
  })

  it('throws on an unknown locus', () => {
    expect(() => locusById('does.not.exist')).toThrow(/unknown locus/i)
    expect(() => locusAt(9999)).toThrow(/no locus/i)
  })
})

describe('homeotic mutants are recessive', () => {
  it('places each mutant at the lower allele index', () => {
    // Allele order is the dominance series and the higher index wins under
    // complete dominance, so a recessive mutant must sit below the normal
    // allele. Getting this backwards makes a double flower dominant, which
    // makes doubles roughly fifty times too common.
    for (const id of ['flower.doubling', 'flower.organ.identity', 'pigment.petal.chlorophyll']) {
      const locus = locusById(id)
      if (locus.kind !== 'discrete') throw new Error(`${id} should be discrete`)
      expect(locus.architecture, id).toBe('homeotic')
      expect(locus.blend, id).toBe(0)
      expect(locus.referenceAllele, id).toBe(locus.alleles.length - 1)
    }
  })

  it('makes the mutant phenotype rare, at roughly the square of its frequency', () => {
    // The test that was missing. Treating a homeotic mutant as dominant made
    // the double phenotype appear in 7.8% of plants where recessivity gives
    // 0.16%, and no test noticed because none checked how often it appeared.
    let double = 0
    const n = 4000
    for (let i = 0; i < n; i += 1) {
      const phenotype = express(founderGenome(ROSEMARY, `recessive-${i}`))
      if (phenotype.discrete['flower.doubling']?.expressed[0] === 'double') double += 1
    }
    const rate = double / n
    // p(double allele) is 0.04, so a recessive phenotype is about 0.0016.
    expect(rate).toBeGreaterThan(0)
    expect(rate).toBeLessThan(0.01)
  })

  it('names the normal allele last, and it is the one the defaults favour', () => {
    const doubling = locusById('flower.doubling')
    if (doubling.kind !== 'discrete') throw new Error('expected discrete')
    expect(doubling.alleles[0]).toBe('double')
    expect(doubling.alleles[doubling.alleles.length - 1]).toBe('single')
  })
})
