import { describe, expect, it } from 'vitest'
import { founderGenome } from '../../src/genome.ts'
import { expressPlant } from '../../src/phenotype.ts'
import { DANDELION, JACARANDA, ROSEMARY, SPEARMINT } from '../../src/species.ts'
import { plantPalette } from '../../src/dev/geometry.ts'
import { flowerShapes } from '../../src/dev/flower.ts'
import { setAlleleByName } from '../helpers.ts'

/**
 * Petal patterns.
 *
 * `pigment.pattern` has been a locus since the beginning and nothing drew it,
 * so a picotee or a blotched flower came out plain. It is one of nineteen loci
 * that were expressed and never read, found by auditing rather than by working
 * through a list.
 *
 * The species are also plain-flowered, which matters as much as the drawing:
 * before the distributions were set, one jacaranda in five was speckled.
 */

function markCount(pattern: string): number {
  const genome = setAlleleByName(
    founderGenome(ROSEMARY, 'pattern'),
    'pigment.pattern',
    pattern,
    pattern,
  )
  const phenotype = expressPlant(genome, ROSEMARY)
  const colours = plantPalette(phenotype, ROSEMARY)
  return flowerShapes(
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
    'pattern',
    'bloom',
  ).length
}

describe('petal patterns', () => {
  it('draws more than a plain petal for every pattern but solid', () => {
    const solid = markCount('solid')
    for (const pattern of ['gradient', 'picotee', 'blotch', 'speckled']) {
      // A pattern is a mark ON the petal, so it can only add shapes.
      expect(markCount(pattern), pattern).toBeGreaterThan(solid)
    }
  })

  it('keeps every pattern mark inside its petal', () => {
    // The first version sized a blotch from `petalWidth`, which is the width
    // BEFORE the outline's own aspect narrows it, so the blotch came out almost
    // as large as the petal. Comparing bounding boxes catches that.
    const extent = (pattern: string): { w: number; h: number } => {
      const genome = setAlleleByName(
        founderGenome(ROSEMARY, 'pattern'),
        'pigment.pattern',
        pattern,
        pattern,
      )
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
        'pattern',
        'bloom',
      )
      let minX = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      for (const part of parts) {
        for (const p of part.points) {
          if (p.x < minX) minX = p.x
          if (p.x > maxX) maxX = p.x
          if (p.y < minY) minY = p.y
          if (p.y > maxY) maxY = p.y
        }
      }
      return { w: maxX - minX, h: maxY - minY }
    }
    const plain = extent('solid')
    for (const pattern of ['gradient', 'picotee', 'blotch', 'speckled']) {
      const marked = extent(pattern)
      expect(marked.w, pattern).toBeLessThanOrEqual(plain.w * 1.05)
      expect(marked.h, pattern).toBeLessThanOrEqual(plain.h * 1.05)
    }
  })

  it('leaves the species mostly plain, because all four of them are', () => {
    for (const species of [ROSEMARY, DANDELION, SPEARMINT, JACARANDA]) {
      let solid = 0
      for (let i = 0; i < 60; i += 1) {
        const phenotype = expressPlant(founderGenome(species, `plain${i}`), species)
        if (phenotype.discrete['pigment.pattern']?.expressed[0] === 'solid') solid += 1
      }
      // A sport is rare by definition, and these four are plain-flowered
      // species. The variants are kept reachable rather than removed, because
      // breeding towards one is the point of a garden.
      expect(solid, species.id).toBeGreaterThan(45)
      expect(solid, species.id).toBeLessThan(60)
    }
  })
})
