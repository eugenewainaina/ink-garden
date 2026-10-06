import { describe, expect, it } from 'vitest'
import { LOCI } from '../../src/loci.ts'
import { founderGenome } from '../../src/genome.ts'
import { expressPlant } from '../../src/phenotype.ts'
import { grow } from '../../src/dev/grow.ts'
import { sceneFromShoot } from '../../src/dev/geometry.ts'
import { ROSEMARY } from '../../src/species.ts'
import { setAlleleByName, setQuantitative } from '../helpers.ts'

/**
 * Every locus must be consumed by something.
 *
 * The problem this exists for is not a bug in a trait. It is that a computed
 * value nobody consumes looks EXACTLY like a value that is not computed, and
 * reading the code cannot tell them apart: `leaf.pubescence` was set correctly
 * for four rounds while the leaf colour it fed had been bypassed, and the
 * symptom was a number that did not move.
 *
 * So this is a runtime guard rather than a search. Every locus is forced to
 * both extremes and the drawing is compared. A locus that changes nothing must
 * be declared, with a reason, in one of the lists below. A NEW locus that
 * nothing consumes fails this test rather than waiting to be found by hand.
 *
 * THE NOISE IS HELD FIXED, which is the whole trick. Developmental jitter is
 * derived from the genome's identity, so changing any locus changes the seed
 * and re-rolls the plant: with the real seed, all ninety loci appear to change
 * the drawing because the individual changed. Pinning the seed is what makes
 * this measure the trait instead of the re-roll.
 */

/**
 * Loci that govern phenology rather than form.
 *
 * When a plant flowers is not what it looks like today, and the drawing is a
 * snapshot. These are consumed by `phenology.ts` and `thermal.ts`.
 */
const PHENOLOGY = new Set([
  'photoperiod.response',
  'photoperiod.critical',
  'vernalization.required',
  'vernalization.hours',
  'thermal.base_temp.a',
  'thermal.base_temp.b',
  'thermal.constant.a',
  'thermal.constant.b',
  'thermal.constant.c',
  'dormancy.depth',
  'lifecycle',
])

/**
 * Loci that change a LATER stage, so a snapshot at bloom is identical.
 *
 * `senescence.rate` is the only one, and it is checked at the seed stage by
 * `senescence.test.ts` instead.
 */
const OTHER_STAGE = new Set(['senescence.rate'])

/**
 * Loci that are expressed and that nothing draws.
 *
 * These are the backlog. Every one is a real trait with no consumer, and the
 * reason is recorded so the list cannot quietly become a dumping ground.
 */
const UNDRAWN: Readonly<Record<string, string>> = {
  'thorn.presence': 'no thorny species in the catalogue',
  'thorn.density.a': 'no thorny species in the catalogue',
  'thorn.density.b': 'no thorny species in the catalogue',
  'thorn.curvature': 'no thorny species in the catalogue',
  'thorn.length': 'no thorny species in the catalogue',
  'nectar_guide': 'a guide is a pattern on the petal and is not drawn',
  'leaf.variegation': 'a variegated leaf is not drawn',
  'habit.determinacy': 'a determinate shoot is not modelled',
  'stem.pigment': 'stem colour is taken from the leaf hue instead',
  'flower.throat': 'the corolla tube is not drawn separately from the lobes',
  'pigment.cold.response': 'needs a temperature the scene does not receive',
  'pigment.gradient_extent': 'the pattern is drawn at a fixed extent',
  'pigment.tip_shift': 'the pattern is drawn at a fixed hue shift',
  'flower.symmetry': 'a zygomorphic flower is drawn radially',
  'leaf.form':
    'decomposition handles simple, pinnate and bipinnate; the palmate and cordate alleles fall back to a simple lamina, so only the last allele is inert',

  // ---- Bypassed rather than missing ----
  //
  // These have a consumer, and the consumer reads something else. They are
  // listed separately because the fix is different: a bypass is wiring, not a
  // missing feature. The locus-consumption guard found all three, which is
  // exactly what it exists for.
  'stem.thickness.a':
    'BYPASSED: the pipe model sets stem radius from leaf area and does not read the trait',
  'stem.thickness.b':
    'BYPASSED: the pipe model sets stem radius from leaf area and does not read the trait',
  'petal.length.a': 'BYPASSED: the flower is sized by flower.diameter and the petals radiate from it',
  'petal.length.b': 'BYPASSED: the flower is sized by flower.diameter and the petals radiate from it',
  'petal.width': 'BYPASSED: petal width is derived from length and petal.overlap',
  'petal.variance.a': 'BYPASSED: petal count reads flower.canalisation, not petal.variance',
  'petal.variance.b': 'BYPASSED: petal count reads flower.canalisation, not petal.variance',
  'pigment.copigment.b':
    'SATURATED: the copigment shift reads the summed trait and the second locus moves it within a band that does not change the drawn colour',
  'pigment.vacuolar.ph.b':
    'SATURATED: the pH shift reads the summed trait and the second locus moves it within a band that does not change the drawn colour',
  'sepal.count.b':
    'SATURATED: a rosemary draws at most eight sepals, so the second locus moves the count inside the cap',
}

/** A fingerprint of everything the drawing produced. */
function fingerprint(genome: Parameters<typeof expressPlant>[0]): number {
  const phenotype = expressPlant(genome, ROSEMARY)
  const fixed = 'guard|fixed'
  const shoot = grow(phenotype, ROSEMARY, fixed, 'bloom')
  const scene = sceneFromShoot(shoot, phenotype, ROSEMARY, fixed)
  let hash = 2166136261
  const mix = (value: number): void => {
    hash ^= Math.round(value * 1000) | 0
    hash = Math.imul(hash, 16777619)
  }
  for (const shape of scene.shapes) {
    mix(shape.points.length)
    for (const point of shape.points) {
      mix(point.x)
      mix(point.y)
    }
    for (let i = 0; i < shape.fill.length; i += 1) mix(shape.fill.charCodeAt(i))
    if (shape.stroke !== undefined) for (let i = 0; i < shape.stroke.length; i += 1) mix(shape.stroke.charCodeAt(i))
  }
  return hash >>> 0
}

/** Two genomes differing only at one locus, at its two extremes. */
function extremes(locusId: string): { readonly a: number; readonly b: number } | undefined {
  const base = founderGenome(ROSEMARY, 'guard')
  const locus = LOCI.find((l) => l.id === locusId)
  if (locus === undefined) return undefined
  if (locus.kind === 'quantitative') {
    return {
      a: fingerprint(setQuantitative(base, locus.id, 0, 0)),
      b: fingerprint(setQuantitative(base, locus.id, 1, 1)),
    }
  }
  const first = locus.alleles[0]
  const last = locus.alleles[locus.alleles.length - 1]
  if (first === undefined || last === undefined) return undefined
  return {
    a: fingerprint(setAlleleByName(base, locus.id, first, first)),
    b: fingerprint(setAlleleByName(base, locus.id, last, last)),
  }
}

describe('every locus is consumed', () => {
  it('changes the drawing, or is declared with a reason', () => {
    const unexplained: string[] = []
    const claimedDrawn: string[] = []

    for (const locus of LOCI) {
      const result = extremes(locus.id)
      if (result === undefined) continue
      const changes = result.a !== result.b

      const declared =
        PHENOLOGY.has(locus.id) || OTHER_STAGE.has(locus.id) || locus.id in UNDRAWN

      if (changes && declared && !(locus.id in UNDRAWN)) {
        // A phenology locus that moves the drawing would mean the snapshot is
        // no longer a snapshot. Not a failure, but worth surfacing.
        continue
      }
      if (!changes && !declared) unexplained.push(locus.id)
      if (changes && locus.id in UNDRAWN) claimedDrawn.push(locus.id)
    }

    expect(unexplained, `undrawn and undeclared: ${unexplained.join(', ')}`).toEqual([])
    expect(claimedDrawn, `declared undrawn but it draws: ${claimedDrawn.join(', ')}`).toEqual([])
  })

  it('leaves every declared-undrawn locus genuinely undrawn', () => {
    // The other direction: a backlog entry that has since been implemented must
    // be removed from the list, or the list stops meaning anything.
    const nowDrawn = Object.keys(UNDRAWN).filter((id) => {
      if (!LOCI.some((l) => l.id === id)) return false
      const result = extremes(id)
      return result !== undefined && result.a !== result.b
    })
    expect(nowDrawn, `declared undrawn but draws: ${nowDrawn.join(', ')}`).toEqual([])
  })
})
