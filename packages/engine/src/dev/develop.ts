import { expressPlant, type Phenotype } from '../phenotype.ts'
import { genomeId, type Genome } from '../genome.ts'
import type { SpeciesTemplate } from '../species.ts'
import { grow } from './grow.ts'
import { placeOrgans } from './layout.ts'
import { makeOrgan, describeStructure, type Organ, type Structure } from './structure.ts'

export interface DevelopInput {
  readonly genome: Genome
  readonly species: SpeciesTemplate
  /**
   * Included for the specimen card, which promises a stage. Growth shape does
   * not depend on it: a rosette is a rosette in January.
   */
  readonly stage?: string
}

/**
 * Assemble a plant: genome to phenotype, growth form to shoot, shoot to placed
 * organs, organs to a structure.
 *
 * This is the entry point, and `grow` behind it is the habit seam. The M0b plan
 * had this function calling the erect shoot builder unconditionally; it is
 * written once here instead, with the dispatch in place, so adding a growth
 * form never means editing a conditional inside an existing loop.
 *
 * Allometry is NOT applied yet. The plan's Task 9 is still pending, so the
 * plausibility score is a placeholder rather than a measurement.
 */
export function develop(input: DevelopInput): Structure {
  const phenotype: Phenotype = expressPlant(input.genome, input.species)
  const seed = `${input.species.id}|${genomeId(input.genome)}`

  const placed = placeOrgans(grow(phenotype, input.species, seed))
  const children: Organ[] = placed.map((organ) =>
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
