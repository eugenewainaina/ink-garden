import { describe, expect, it } from 'vitest'
import { createGenome, type Genome } from '../src/genome.ts'
import { referenceGenome } from './helpers.ts'
import {
  LOCI,
  locusIndex,
  quantitativeTraits,
  type DiscreteLocus,
} from '../src/loci.ts'
import { DERIVED_TRAITS, express, resolveDiscrete } from '../src/phenotype.ts'

const thorned: DiscreteLocus = {
  id: 'thorn.presence',
  kind: 'discrete',
  alleles: ['thornless', 'thorned'],
  blend: 0,
  mutation: 0.004,
  architecture: 'polymorphic',
}

const series: DiscreteLocus = {
  id: 'pigment.anthocyanidin',
  kind: 'discrete',
  alleles: ['none', 'pelargonidin', 'cyanidin', 'delphinidin'],
  blend: 0,
  mutation: 0.004,
  architecture: 'canalised',
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

// The reference allele, not index 0: see test/helpers.ts for why that
// distinction matters.
const flat = (): Genome => referenceGenome()

function setAllele(genome: Genome, locusId: string, a: number, b: number): Genome {
  const alleles = genome.alleles.map((pair, i) =>
    i === locusIndex(locusId) ? ([a, b] as const) : pair,
  )
  return createGenome(alleles)
}

describe('express', () => {
  it('covers every locus', () => {
    const phenotype = express(flat())
    for (const locus of LOCI) {
      if (locus.kind === 'discrete') {
        expect(phenotype.discrete[locus.id]).toBeDefined()
      }
    }
  })

  it('sums polygenic contributions per trait', () => {
    const phenotype = express(flat())
    expect(phenotype.quantitative['height']).toBe(0)

    const tall = setAllele(flat(), 'habit.height.a', 1, 1)
    expect(express(tall).quantitative['height']).toBeCloseTo(0.18, 10)
  })

  it('accumulates several loci onto one trait', () => {
    let g = setAllele(flat(), 'leaf.length.a', 1, 1)
    g = setAllele(g, 'leaf.length.b', 1, 1)
    expect(express(g).quantitative['leaf.length']).toBeCloseTo(1.56, 10)
  })

  it('does not invent a petal count without a species', () => {
    // Petal number is canalised, so it is a species-level trait. The genomic
    // layer must not guess one.
    expect(express(flat()).quantitative['petal.count']).toBeUndefined()
  })

  it('includes every quantitative trait, present or not', () => {
    const phenotype = express(flat())
    for (const trait of quantitativeTraits()) {
      expect(typeof phenotype.quantitative[trait]).toBe('number')
    }
  })

  it('includes the derived traits that epistasis rules write to', () => {
    const phenotype = express(flat())
    for (const [trait, value] of Object.entries(DERIVED_TRAITS)) {
      expect(phenotype.quantitative[trait]).toBeCloseTo(value, 10)
    }
  })

  it('is deterministic', () => {
    const g = setAllele(flat(), 'thorn.presence', 1, 0)
    expect(express(g)).toEqual(express(g))
  })

  it('does not mutate the genome', () => {
    const g = flat()
    const before = JSON.stringify(g)
    express(g)
    expect(JSON.stringify(g)).toBe(before)
  })
})
