import { describe, expect, it } from 'vitest'
import { founderGenome } from '../../src/genome.ts'
import { shootFor } from '../../src/dev/develop.ts'
import type { Genome } from '../../src/genome.ts'
import { JACARANDA, ROSEMARY, SPEARMINT } from '../../src/species.ts'
import { setAlleleByName, setQuantitative } from '../helpers.ts'

/**
 * Heritability of shape.
 *
 * A breeding garden rests on this: a seedling must resemble its parents. The
 * engine seeds every developmental random draw from the genome's own identity,
 * `species.id + genomeId(genome)`, so changing any locus changes every draw.
 * That is fine for a jitter in how big one leaf is and catastrophic for
 * anything structural.
 *
 * It WAS catastrophic. `shouldBranch` compared a per-node coin flip against the
 * apical dominance and ignored the bud's position, so the branch count was a
 * binomial random variable. Changing one locus could take a jacaranda from two
 * branches to six. These tests exist because that happened, and it was found by
 * accident while adding petioles rather than by any test.
 */

function branchCount(genome: Parameters<typeof shootFor>[0], species: Parameters<typeof shootFor>[1]): number {
  const { shoot } = shootFor(genome, species)
  let total = 0
  const walk = (s: typeof shoot): void => {
    total += s.branches.length
    for (const b of s.branches) walk(b.shoot)
  }
  walk(shoot)
  return total
}

describe('shape is heritable', () => {
  it('does not re-roll the architecture when one flower-colour locus changes', () => {
    // `pigment.intensity.a` has nothing to do with branching. Breeding for a
    // deeper flower must not move the plant's skeleton.
    for (const species of [ROSEMARY, SPEARMINT, JACARANDA]) {
      const parent = founderGenome(species, 'heritable')
      const child = setQuantitative(parent, 'pigment.intensity.a', 0, 0)

      const before = branchCount(parent, species)
      const after = branchCount(child, species)
      // The draw still shifts by a node at the boundary, so one branch either
      // way is expected. A doubling is not.
      expect(Math.abs(after - before), `${species.id}: ${before} -> ${after}`).toBeLessThanOrEqual(2)
    }
  })

  it('does not re-roll the architecture when an unrelated leaf locus changes', () => {
    for (const species of [ROSEMARY, SPEARMINT, JACARANDA]) {
      const parent = founderGenome(species, 'heritable2')
      const child = setQuantitative(parent, 'leaf.petiole', 0, 0)
      const before = branchCount(parent, species)
      const after = branchCount(child, species)
      expect(Math.abs(after - before), `${species.id}: ${before} -> ${after}`).toBeLessThanOrEqual(2)
    }
  })

  it('keeps the branch rate close to the parent across many single-locus edits', () => {
    // The strongest form: walk every locus and check that no single edit
    // transforms the plant. One locus at a time, the way a mutation arrives.
    const species = JACARANDA
    const parent = founderGenome(species, 'sweep')
    const base = branchCount(parent, species)
    const worst: { locus: string; count: number }[] = []

    // One locus at a time, the way a mutation arrives. Quantitative loci take a
    // value and discrete ones an allele, so the two are listed separately
    // rather than pretending one helper covers both.
    // Locus ids, not trait names: a quantitative trait is carried by several
    // loci and this edits one of them.
    const quantitative = [
      'pigment.intensity.a',
      'leaf.petiole',
      'leaf.gloss',
      'stamen.count.a',
      'sepal.length.a',
      'petal.length.a',
      'carpel.style.a',
    ]
    for (const trait of quantitative) {
      const child: Genome = setQuantitative(parent, trait, 0, 0)
      worst.push({ locus: trait, count: branchCount(child, species) })
    }
    const discrete = [
      ['pigment.carotenoid', 'none'],
      ['thorn.presence', 'thornless'],
      ['pigment.anthocyanidin', 'none'],
      ['pigment.pattern', 'solid'],
    ] as const
    for (const [id, allele] of discrete) {
      const child: Genome = setAlleleByName(parent, id, allele, allele)
      worst.push({ locus: id, count: branchCount(child, species) })
    }

    for (const entry of worst) {
      expect(Math.abs(entry.count - base), `${entry.locus}: base ${base} -> ${entry.count}`).toBeLessThanOrEqual(
        Math.max(2, Math.round(base * 0.5)),
      )
    }
  })
})
