import { describe, expect, it } from 'vitest'
import { founderGenome } from '../../src/genome.ts'
import { expressPlant } from '../../src/phenotype.ts'
import { DANDELION, ROSEMARY } from '../../src/species.ts'
import { plantPalette } from '../../src/dev/geometry.ts'
import { shootFor } from '../../src/dev/develop.ts'
import { sceneFromShoot } from '../../src/dev/geometry.ts'
import { flowerShapes } from '../../src/dev/flower.ts'
import { setQuantitative } from '../helpers.ts'

/**
 * Four loci that were expressed and never read.
 *
 * `petal.curl`, `petal.overlap`, `petal.substance` and `leaf.gloss` all existed
 * in the genome and were fixed constants in the code instead: the petal curve
 * was 0.4, the petal width just over a half, and a leaf had no sheen whatever
 * its wax layer said. Found by auditing rather than by working a list.
 */

/** A trait reads as the two extremes it is meant to produce. */
function at(trait: string, value: number) {
  const genome = setQuantitative(founderGenome(ROSEMARY, 'traits'), trait, value, value)
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
    'traits',
    'bloom',
  )
  const petals = parts.filter((part) => part.fill === colours.petal)
  // The petals' total AREA, not the flower's extent. Overlap widens a petal,
  // and the flower's x-extent is set by where the petal tips reach rather than
  // by how broad they are, so an extent measured the wrong thing and came out
  // identical at both extremes.
  const area = petals.reduce((sum, part) => {
    let acc = 0
    const points = part.points
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      if (a === undefined || b === undefined) continue
      acc += a.x * b.y - b.x * a.y
    }
    return sum + Math.abs(acc) / 2
  }, 0)
  return { phenotype, colours, parts, petals, area }
}

describe('petal geometry', () => {
  it('makes a broader petal from more overlap', () => {
    expect(at('petal.overlap', 1).area).toBeGreaterThan(at('petal.overlap', 0).area)
  })

  it('bends the petals further with more curl', () => {
    // Curl changes the shape of a petal rather than its reach, so the check is
    // that the two are not identical rather than that one is bigger.
    const flat = at('petal.curl', 0).petals.map((p) => p.points.map((q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`).join(' ')).join('|')
    const curled = at('petal.curl', 1).petals.map((p) => p.points.map((q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`).join(' ')).join('|')
    expect(flat).not.toBe(curled)
  })

  it('pales a thin petal against a thick one', () => {
    const thin = at('petal.substance', 0)
    const thick = at('petal.substance', 1)
    const lum = (hex: string): number => {
      const value = Number.parseInt(hex.slice(1), 16)
      return ((value >> 16) & 0xff) + ((value >> 8) & 0xff) + (value & 0xff)
    }
    // A thin petal is more translucent, so it reads paler.
    expect(lum(thin.colours.petal)).toBeGreaterThan(lum(thick.colours.petal))
  })
})

describe('leaf gloss', () => {
  function paleFraction(gloss: number): number {
    const genome = setQuantitative(founderGenome(DANDELION, 'gloss'), 'leaf.gloss', gloss, gloss)
    const { shoot, phenotype, seed } = shootFor(genome, DANDELION, 'bloom')
    const scene = sceneFromShoot(shoot, phenotype, DANDELION, seed)
    const area = (points: readonly { x: number; y: number }[]): number => {
      let sum = 0
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i]
        const b = points[(i + 1) % points.length]
        if (a === undefined || b === undefined) continue
        sum += a.x * b.y - b.x * a.y
      }
      return Math.abs(sum) / 2
    }
    const lum = (hex: string): number => {
      const value = Number.parseInt(hex.slice(1), 16)
      return ((value >> 16) & 0xff) + ((value >> 8) & 0xff) + (value & 0xff)
    }
    const leaves = scene.shapes.filter((s) => s.role === 'leaf' && s.fill !== 'none')
    const total = leaves.reduce((sum, s) => sum + area(s.points), 0)
    const pale = leaves.filter((s) => lum(s.fill) > 400).reduce((sum, s) => sum + area(s.points), 0)
    return total <= 0 ? 0 : pale / total
  }

  it('draws no highlight on a matte leaf', () => {
    expect(paleFraction(0)).toBe(0)
  })

  it('draws a highlight that is a streak and not a wash', () => {
    const fraction = paleFraction(1)
    expect(fraction).toBeGreaterThan(0.02)
    // A sheen covering most of the blade is not a sheen. The first version was
    // sized from the pre-aspect width and came out wider than the leaf.
    expect(fraction).toBeLessThan(0.35)
  })
})
