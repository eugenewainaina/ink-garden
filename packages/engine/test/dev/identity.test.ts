import { describe, expect, it } from 'vitest'
import { founderGenome } from '../../src/genome.ts'
import { expressPlant } from '../../src/phenotype.ts'
import { ROSEMARY } from '../../src/species.ts'
import { plantPalette } from '../../src/dev/geometry.ts'
import { flowerShapes } from '../../src/dev/flower.ts'
import { petaloidWhorls, whorlIdentity } from '../../src/dev/identity.ts'
import { setAlleleByName } from '../helpers.ts'

/**
 * The ABC model, wired in.
 *
 * `identity.ts` has resolved the four floral whorls since the beginning and
 * NOTHING CALLED IT, so the two homeotic mutations it exists for were expressed
 * on every plant and drawn on none. That is worth a test of its own: dead code
 * that is correct is still a feature the app does not have.
 *
 * A double flower is the interesting case. It is what happens when class C is
 * lost and whorl three becomes petals instead of stamens, and for a breeding
 * garden it is a goal rather than a detail.
 */

function shapesFor(genome: Parameters<typeof expressPlant>[0]) {
  const phenotype = expressPlant(genome, ROSEMARY)
  const colours = plantPalette(phenotype, ROSEMARY)
  const parts = flowerShapes(
    {
      kind: 'flower',
      x: 0,
      y: 0,
      depth: 0,
      angle: 0,
      scale: 1,
      length: phenotype.quantitative['flower.diameter'] ?? 1,
      width: 0,
      facing: 1,
    },
    phenotype,
    'cyme',
    colours,
    'identity',
    'bloom',
  )
  return { phenotype, colours, parts }
}

const base = founderGenome(ROSEMARY, 'abc')

describe('the ABC model', () => {
  it('is a normal flower when nothing is mutated', () => {
    const single = expressPlant(base, ROSEMARY)
    expect(whorlIdentity(1, single)).toBe('sepal')
    expect(whorlIdentity(2, single)).toBe('petal')
    expect(whorlIdentity(3, single)).toBe('stamen')
    expect(whorlIdentity(4, single)).toBe('carpel')
    expect(petaloidWhorls(single)).toEqual([2])
  })

  it('turns whorl three into petals for a double flower', () => {
    const doubled = expressPlant(
      setAlleleByName(base, 'flower.doubling', 'double', 'double'),
      ROSEMARY,
    )
    expect(petaloidWhorls(doubled)).toEqual([2, 3])
  })

  it('turns whorl one into petals for petaloid sepals', () => {
    const petaloid = expressPlant(
      setAlleleByName(base, 'flower.organ.identity', 'sepals.petaloid', 'sepals.petaloid'),
      ROSEMARY,
    )
    expect(petaloidWhorls(petaloid)).toEqual([1, 2])
  })
})

describe('a double flower', () => {
  it('has no stamens, because the stamens ARE the petals', () => {
    const single = shapesFor(base)
    const doubled = shapesFor(setAlleleByName(base, 'flower.doubling', 'double', 'double'))

    // Anthers are the only shapes in the anther colour; the stigma is one of
    // them, so a single flower has anthers plus a stigma and a double has the
    // stigma alone.
    const anthers = (shapes: typeof single): number =>
      shapes.parts.filter((p) => p.fill === shapes.colours.anther).length
    expect(anthers(single)).toBeGreaterThan(anthers(doubled))
    expect(anthers(doubled)).toBe(1)
  })

  it('has more petals than a single one', () => {
    const single = shapesFor(base)
    const doubled = shapesFor(setAlleleByName(base, 'flower.doubling', 'double', 'double'))
    const petals = (shapes: typeof single): number =>
      shapes.parts.filter((p) => p.fill === shapes.colours.petal).length
    // The count is already doubled by the phenotype; what the model adds here is
    // that they arrive as TWO whorls. Adding a ring on top of the doubled count
    // made a double-double, which is what this catches.
    expect(petals(doubled)).toBe(Math.round(doubled.phenotype.quantitative['petal.count'] ?? 0))
    expect(petals(doubled)).toBeGreaterThan(petals(single))
  })
})

describe('petaloid sepals', () => {
  it('paints the calyx in the petal colour', () => {
    const petaloid = shapesFor(
      setAlleleByName(base, 'flower.organ.identity', 'sepals.petaloid', 'sepals.petaloid'),
    )
    const normal = shapesFor(base)
    // The calyx cup is the widest shape drawn in the calyx colour. In a
    // petaloid flower that colour must not appear at all.
    const calyxShapes = (shapes: typeof normal): number =>
      shapes.parts.filter((p) => p.fill === shapes.colours.calyx).length
    expect(calyxShapes(petaloid)).toBe(0)
    expect(calyxShapes(normal)).toBeGreaterThan(0)
  })
})
