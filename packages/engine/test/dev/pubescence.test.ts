import { describe, expect, it } from 'vitest'
import { founderGenome } from '../../src/genome.ts'
import { expressPlant } from '../../src/phenotype.ts'
import { shootFor } from '../../src/dev/develop.ts'
import { sceneFromShoot } from '../../src/dev/geometry.ts'
import { DANDELION, JACARANDA, ROSEMARY, SPEARMINT, type SpeciesTemplate } from '../../src/species.ts'
import { setAlleleByName } from '../helpers.ts'

/**
 * Pubescence.
 *
 * Bean's gives rosemary leaves as "dark rather glossy green above, WHITE-FELTED
 * BENEATH", and `leaf.pubescence` and `stem.pubescence` have been loci from the
 * beginning with nothing reading them.
 *
 * The interesting failure was not the trait being unread. It was that the fix
 * had no effect for three attempts: the leaf's colour had moved into the ageing
 * block several rounds earlier, and that block read the species baseline
 * directly, bypassing the leaf colour the wash was applied to. The flag was
 * true, the colour was computed, and the blade did not use it.
 */

/** The blade colour by area, which is the pair of shades a plant draws in. */
function bladeFills(species: SpeciesTemplate, pubescence: 'glabrous' | 'pubescent'): string {
  let genome = founderGenome(species, 'hair')
  genome = setAlleleByName(genome, 'leaf.pubescence', pubescence, pubescence)
  genome = setAlleleByName(genome, 'stem.pubescence', pubescence, pubescence)
  const { shoot, phenotype, seed } = shootFor(genome, species, 'bloom')
  const scene = sceneFromShoot(shoot, phenotype, species, seed)
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
  const byArea = new Map<string, number>()
  for (const shape of scene.shapes) {
    if (shape.role !== 'leaf' || shape.fill === 'none') continue
    byArea.set(shape.fill, (byArea.get(shape.fill) ?? 0) + area(shape.points))
  }
  return [...byArea.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([fill]) => fill)
    .join(' ')
}

describe('pubescence', () => {
  it('greys the blade of a felted leaf against a glabrous one', () => {
    expect(bladeFills(ROSEMARY, 'pubescent')).not.toBe(bladeFills(ROSEMARY, 'glabrous'))
  })

  it('leaves the species mostly glabrous except the one the flora calls felted', () => {
    // Bean's gives rosemary a white felt. The Flora of Pakistan gives mint
    // stems as "glabrous", the Flora of New Zealand gives the dandelion
    // "glabrous or with sparse short multicellular hairs", and PlantNET gives
    // jacaranda leaves as "thin, paler below" with no hairs at all.
    const pubescentRate = (species: SpeciesTemplate): number => {
      let count = 0
      for (let i = 0; i < 60; i += 1) {
        const phenotype = expressPlant(founderGenome(species, `rate${i}`), species)
        if (phenotype.discrete['leaf.pubescence']?.expressed[0] === 'pubescent') count += 1
      }
      return count / 60
    }
    expect(pubescentRate(ROSEMARY)).toBeGreaterThan(0.8)
    for (const species of [DANDELION, SPEARMINT, JACARANDA]) {
      expect(pubescentRate(species), species.id).toBeLessThan(0.2)
    }
  })
})
