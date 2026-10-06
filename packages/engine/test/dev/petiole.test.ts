import { describe, expect, it } from 'vitest'
import { founderGenome } from '../../src/genome.ts'
import { MAX_PETIOLE_FRACTION, expressPlant } from '../../src/phenotype.ts'
import { DANDELION, JACARANDA, ROSEMARY, SPEARMINT, type SpeciesTemplate } from '../../src/species.ts'

/**
 * The petiole.
 *
 * Two things are worth pinning and both were wrong at some point. A petiole is
 * a PROPORTION of its own leaf rather than an absolute size, which it was not:
 * it was scaled by the leaf-size baseline, so rosemary came out with a 3 cm
 * "petiole" on a 2.6 cm leaf. And a species either has one or does not, which
 * is a diagnostic character rather than a detail: Bean's gives rosemary as "not
 * stalked" and PlantNET gives jacaranda's pinnules as "sessile".
 */
function petioleOf(species: SpeciesTemplate, seed: string): number {
  const phenotype = expressPlant(founderGenome(species, seed), species)
  return (phenotype.quantitative['leaf.petiole'] ?? 0) /
    Math.max(1e-9, phenotype.quantitative['leaf.length'] ?? 1)
}

describe('the petiole', () => {
  it('is a fraction of its own leaf, never a length on its own', () => {
    for (const species of [ROSEMARY, DANDELION, SPEARMINT, JACARANDA]) {
      for (let i = 0; i < 12; i += 1) {
        const fraction = petioleOf(species, `frac${i}`)
        expect(fraction, species.id).toBeGreaterThanOrEqual(0)
        expect(fraction, species.id).toBeLessThanOrEqual(MAX_PETIOLE_FRACTION + 1e-9)
      }
    }
  })

  it('never exceeds the leaf that carries it', () => {
    // The bug this catches: a petiole longer than its own blade, which is what
    // scaling it by leaf size produced.
    for (const species of [ROSEMARY, DANDELION, SPEARMINT, JACARANDA]) {
      for (let i = 0; i < 12; i += 1) {
        const phenotype = expressPlant(founderGenome(species, `len${i}`), species)
        const petiole = phenotype.quantitative['leaf.petiole'] ?? 0
        const leaf = phenotype.quantitative['leaf.length'] ?? 0
        expect(petiole, species.id).toBeLessThanOrEqual(leaf * MAX_PETIOLE_FRACTION + 1e-9)
      }
    }
  })

  it('is absent on the two species the floras call stalkless', () => {
    // Bean's: rosemary "not stalked". PlantNET: jacaranda pinnules "sessile".
    for (const species of [ROSEMARY, JACARANDA]) {
      for (let i = 0; i < 20; i += 1) {
        expect(petioleOf(species, `sess${i}`), species.id).toBe(0)
      }
    }
  })

  it('is present on the two that have one, which is most leaves', () => {
    const dandelion = Array.from({ length: 20 }, (_, i) => petioleOf(DANDELION, `has${i}`))
    expect(Math.max(...dandelion)).toBeGreaterThan(0.1)
    // The Flora of New Zealand gives the dandelion a hollow petiole, and its
    // blade is drawn out into it rather than sitting on the crown.
    expect(dandelion.filter((f) => f > 0.05).length).toBeGreaterThan(10)
  })
})
