import { describe, expect, it } from 'vitest'
import {
  LOCI,
  LOCUS_INDEX,
  locusAt,
  locusById,
  locusIndex,
  quantitativeTraits,
} from '../src/loci.ts'

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
    ]) {
      expect(ids).toContain(required)
    }
  })

  it('lists each quantitative trait once', () => {
    const traits = quantitativeTraits()
    expect(new Set(traits).size).toBe(traits.length)
    expect(traits).toContain('petal.count')
    expect(traits).toContain('height')
  })

  it('throws on an unknown locus', () => {
    expect(() => locusById('does.not.exist')).toThrow(/unknown locus/i)
    expect(() => locusAt(9999)).toThrow(/no locus/i)
  })
})
