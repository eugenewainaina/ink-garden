import { describe, expect, it } from 'vitest'
import { founderGenome, type Genome } from '../../src/genome.ts'
import { shootFor } from '../../src/dev/develop.ts'
import { sceneFromShoot } from '../../src/dev/geometry.ts'
import { DANDELION, JACARANDA, ROSEMARY, SPEARMINT, type SpeciesTemplate } from '../../src/species.ts'
import { setQuantitative } from '../helpers.ts'

/**
 * Leaf ageing.
 *
 * A shoot's leaves are not contemporary: the ones near the base unfolded first
 * and are the oldest, and chlorophyll breaks down before the carotenoids do, so
 * an old leaf yellows rather than fading. `senescence.rate` has been a locus
 * since the beginning and nothing read it, which meant a plant looked the same
 * in June and October.
 *
 * The engine has no image to compare, so this reads the colour it actually
 * put on the lowest and highest blade and checks the direction of the shift.
 */

/** Polygon area, so a vein can be told from a blade. */
function area(points: readonly { x: number; y: number }[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a === undefined || b === undefined) continue
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/** Red minus blue: higher means yellower, lower means greener or bluer. */
function yellowness(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  return ((value >> 16) & 0xff) - (value & 0xff)
}

/**
 * The mean yellowness of the largest filled leaf shapes.
 *
 * Deliberately not "the lowest shape": veins are also filled and also carry
 * role 'leaf', and a vein's colour does not age, so an earlier version of this
 * measured a vein and concluded rosemary did not senesce. The largest shapes in
 * a scene are always blades.
 */
function bladeYellowness(species: SpeciesTemplate, stage: string, rate: number): number {
  // The rate is set explicitly rather than left to the seed. `senescence.rate`
  // is a real varying trait, so a test that depends on the draw is testing
  // luck: an earlier version passed on one seed and failed on the next,
  // reporting that rosemary did not senesce when in fact that seedling's rate
  // was nought.
  const genome: Genome = setQuantitative(
    founderGenome(species, 'senesce'),
    'senescence.rate',
    rate,
    rate,
  )
  const { shoot, phenotype, seed } = shootFor(genome, species, stage)
  const scene = sceneFromShoot(shoot, phenotype, species, seed)
  const blades = scene.shapes
    .filter((s) => s.role === 'leaf' && s.fill !== 'none')
    .map((s) => ({ area: area(s.points), fill: s.fill }))
    .sort((a, b) => b.area - a.area)
    .slice(0, 20)
  if (blades.length === 0) return Number.NaN
  return blades.reduce((sum, blade) => sum + yellowness(blade.fill), 0) / blades.length
}

describe('leaf ageing', () => {
  /**
   * The lowest blade's colour at one stage.
   *
   * Comparing bloom against seed for the SAME species is what isolates
   * senescence. Comparing the base against the tip does not, because a shoot
   * also has a youth gradient: a young leaf is fresher and a little yellower,
   * which is a different effect and was strong enough to mask senescence until
   * it was weakened.
   */
  it('yellows the oldest leaves once the plant has set seed', () => {
    for (const species of [JACARANDA, ROSEMARY]) {
      const bloom = bladeYellowness(species, 'bloom', 0)
      const seed = bladeYellowness(species, 'seed', 1)
      expect(seed, `${species.id}: bloom ${bloom} -> seed ${seed}`).toBeGreaterThan(bloom + 10)
    }
  })

  it('holds its colour on the species whose senescence rate is nothing', () => {
    // A dandelion and a mint do not yellow, and their rate is zero. This is the
    // other half of the locus meaning something.
    for (const species of [DANDELION, SPEARMINT, ROSEMARY]) {
      // With the rate at nought nothing yellows, on any of them.
      const bloom = bladeYellowness(species, 'bloom', 0)
      const seed = bladeYellowness(species, 'seed', 0)
      expect(Math.abs(seed - bloom), species.id).toBeLessThan(12)
    }
  })
})
