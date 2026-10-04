import { describe, expect, it } from 'vitest'
import { resolveDiscrete } from '../src/phenotype.ts'
import type { DiscreteLocus } from '../src/loci.ts'

const thorned: DiscreteLocus = {
  id: 'thorn.presence',
  kind: 'discrete',
  alleles: ['thornless', 'thorned'],
  blend: 0,
  mutation: 0.004,
}

const series: DiscreteLocus = {
  id: 'pigment.anthocyanidin',
  kind: 'discrete',
  alleles: ['none', 'pelargonidin', 'cyanidin', 'delphinidin'],
  blend: 0,
  mutation: 0.004,
}

const codominant: DiscreteLocus = { ...series, blend: 1 }
const incomplete: DiscreteLocus = { ...series, blend: 0.5 }

describe('resolveDiscrete', () => {
  it('expresses the allele alone when homozygous', () => {
    const trait = resolveDiscrete(series, [2, 2])
    expect(trait.expressed).toEqual(['cyanidin'])
    expect(trait.winner).toBe(2)
    expect(trait.blended).toBe(false)
    expect(trait.secondaryWeight).toBe(0)
  })

  it('expresses the higher-ranked allele alone under complete dominance', () => {
    const trait = resolveDiscrete(thorned, [0, 1])
    expect(trait.expressed).toEqual(['thorned'])
    expect(trait.winner).toBe(1)
    expect(trait.blended).toBe(false)
  })

  it('is insensitive to copy order', () => {
    expect(resolveDiscrete(thorned, [0, 1])).toEqual(resolveDiscrete(thorned, [1, 0]))
    expect(resolveDiscrete(series, [1, 3])).toEqual(resolveDiscrete(series, [3, 1]))
  })

  it('follows the dominance series, not the index order of the pair', () => {
    const trait = resolveDiscrete(series, [1, 3])
    expect(trait.winner).toBe(3)
    expect(trait.expressed).toEqual(['delphinidin'])
  })

  it('expresses both alleles under codominance', () => {
    const trait = resolveDiscrete(codominant, [1, 3])
    expect(trait.expressed).toEqual(['delphinidin', 'pelargonidin'])
    expect(trait.blended).toBe(true)
    expect(trait.secondaryWeight).toBeCloseTo(0.5, 10)
  })

  it('masks the lower allele partly under incomplete dominance', () => {
    const trait = resolveDiscrete(incomplete, [1, 3])
    expect(trait.expressed).toEqual(['delphinidin', 'pelargonidin'])
    expect(trait.blended).toBe(true)
    // blend 0.5 means the lower allele contributes half as much as it would
    // under codominance.
    expect(trait.secondaryWeight).toBeCloseTo(0.25, 10)
    expect(trait.secondaryWeight).toBeLessThan(
      resolveDiscrete(codominant, [1, 3]).secondaryWeight,
    )
  })

  it('does not blend a homozygous pair even when codominant', () => {
    const trait = resolveDiscrete(codominant, [3, 3])
    expect(trait.expressed).toEqual(['delphinidin'])
    expect(trait.blended).toBe(false)
  })

  it('rejects an allele outside the locus', () => {
    expect(() => resolveDiscrete(thorned, [0, 2])).toThrow(/invalid allele/i)
  })
})
