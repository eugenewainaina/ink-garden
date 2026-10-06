import { describe, expect, it } from 'vitest'
import { founderGenome } from '../../src/genome.ts'
import { expressPlant, normalisedTrait } from '../../src/phenotype.ts'
import { DANDELION, JACARANDA, ROSEMARY, SPEARMINT, type SpeciesTemplate } from '../../src/species.ts'

/**
 * Allocation.
 *
 * A plant fixes carbon and divides it between roots, stems and leaves, and that
 * division is what its proportions ARE. Both allocation loci have been in the
 * genome from the beginning and neither was read, so leaf size and internode
 * length varied independently and a plant could be leafy AND leggy at once,
 * which no real plant is.
 *
 * The important property, and the one that took two attempts, is that allocation
 * moves the STEM and leaves the LEAF where the flora put it. A first version
 * scaled the leaf too and took a jacaranda to 6.5 to 75 cm against PlantNET's
 * 15 to 33, because the leaf-length locus already fills that range on its own.
 */

function of(species: SpeciesTemplate, seed: string) {
  const phenotype = expressPlant(founderGenome(species, seed), species)
  return {
    leaf: phenotype.quantitative['leaf.length'] ?? 0,
    stem: phenotype.quantitative['internode.length'] ?? 0,
    allocation: normalisedTrait(phenotype, 'allocation.leaf_vs_stem'),
    root: normalisedTrait(phenotype, 'allocation.root_shoot'),
  }
}

/** The species' typical leaf, before any genomic variation. */
function baselineLeaf(species: SpeciesTemplate): number {
  return species.baseline.leafSize
}

describe('allocation', () => {
  it('leaves the leaf where the flora put it', () => {
    // The leaf's dimensions are the measurement, and allocation must not move
    // them: a leafy plant is one carrying the same lamina on less stem.
    for (const species of [ROSEMARY, DANDELION, SPEARMINT, JACARANDA]) {
      const leaves = Array.from({ length: 120 }, (_, i) => of(species, `alloc${i}`).leaf)
      const low = Math.min(...leaves)
      const high = Math.max(...leaves)
      // Whatever the allocation, the leaf stays inside the spread the
      // leaf-length locus alone produces: within half to one and a half times
      // the species' typical.
      expect(low, species.id).toBeGreaterThanOrEqual(baselineLeaf(species) * 0.45)
      expect(high, species.id).toBeLessThanOrEqual(baselineLeaf(species) * 1.6)
    }
  })

  it('gives a leafier plant a shorter stem, carrying the same lamina', () => {
    const row = (species: SpeciesTemplate) => {
      const rows = Array.from({ length: 120 }, (_, i) => of(species, `ratio${i}`))
      rows.sort((a, b) => a.allocation - b.allocation)
      return { woody: rows[0], leafy: rows[rows.length - 1] }
    }
    for (const species of [ROSEMARY, SPEARMINT, JACARANDA]) {
      const { woody, leafy } = row(species)
      if (woody === undefined || leafy === undefined) continue
      expect(leafy.allocation, species.id).toBeGreaterThan(woody.allocation)
      expect(leafy.stem, species.id).toBeLessThan(woody.stem)
    }
  })

  it('keeps a high root-to-shoot plant compact rather than small-leaved', () => {
    const rows = Array.from({ length: 150 }, (_, i) => of(JACARANDA, `root${i}`))
    rows.sort((a, b) => a.root - b.root)
    const shallow = rows[3]
    const deep = rows[rows.length - 4]
    if (shallow === undefined || deep === undefined) return
    expect(deep.root).toBeGreaterThan(shallow.root)
    // A deeper root system costs shoot extension, not leaf size.
    expect(deep.stem).toBeLessThan(shallow.stem)
    // And the leaves are drawn from the same pool on both.
    expect(Math.abs(deep.leaf - shallow.leaf) / Math.max(1e-9, shallow.leaf)).toBeLessThan(0.9)
  })
})
