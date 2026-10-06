import { expressPlant, type Phenotype } from '../phenotype.ts'
import { genomeId, type Genome } from '../genome.ts'
import type { SpeciesTemplate } from '../species.ts'
import { grow } from './grow.ts'
import { DEFAULT_TILT_DEG, placeOrgans, projectOrgans } from './layout.ts'
import { makeOrgan, describeStructure, type Organ, type Structure } from './structure.ts'
import type { Shoot } from './meristem.ts'

export interface DevelopInput {
  readonly genome: Genome
  readonly species: SpeciesTemplate
  /**
   * The phenological stage, which decides what the flowers are doing: nothing
   * before `bud`, closed buds at `bud`, open flowers at `bloom`. A vegetative
   * plant is leaves and stem, which is what most of its year looks like.
   */
  readonly stage?: string
}

/**
 * Grow a shoot without measuring it.
 *
 * The drawing path uses this, because a picture needs organs in three
 * dimensions with their orientations, which a flattened `Structure` cannot
 * carry. `develop` measures; this draws.
 */
export function shootFor(
  genome: Genome,
  species: SpeciesTemplate,
  stage = 'bloom',
): { readonly shoot: Shoot; readonly phenotype: Phenotype; readonly seed: string } {
  const phenotype = expressPlant(genome, species)
  const seed = `${species.id}|${genomeId(genome)}`
  return { shoot: grow(phenotype, species, seed, stage), phenotype, seed }
}

/**
 * Assemble a plant and measure it.
 *
 * Growth form is dispatched inside `grow`, so adding a habit never means editing
 * a conditional in a loop that already exists. Measurements are taken in the
 * projected view, so the height reported is the height a viewer sees rather
 * than a raw vertical sum.
 *
 * Allometry is NOT applied yet: the plan's Task 9 is still pending, so the
 * plausibility score is a placeholder rather than a measurement.
 */
export function develop(input: DevelopInput): Structure {
  const { shoot } = shootFor(input.genome, input.species, input.stage)
  const projected = projectOrgans(placeOrgans(shoot), DEFAULT_TILT_DEG)

  const children: Organ[] = projected.map((organ) =>
    makeOrgan(
      organ.kind,
      { x: organ.x, y: organ.y, angle: organ.angle, scale: organ.scale },
      organ.length,
      organ.width,
    ),
  )

  const root = makeOrgan('root', { x: 0, y: 0, angle: 0, scale: 1 }, 0, 0, children)
  return describeStructure(root, input.stage ?? 'bloom', 1)
}
