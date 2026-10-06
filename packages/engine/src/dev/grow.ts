import { rngFrom } from '../rng.ts'
import type { Phenotype } from '../phenotype.ts'
import type { SpeciesTemplate } from '../species.ts'
import { buildShoot, type Shoot } from './meristem.ts'
import { nextBudAngle, projectLeaf } from './phyllotaxis.ts'
import { shootGeometry, growthFormOf, type ShootGeometry } from './shoot.ts'
import { makeOrgan, type Organ } from './structure.ts'

/**
 * Grow a shoot, dispatching on growth form.
 *
 * This is the seam. The research was explicit that a rosette is not a short
 * plant: it has no internode elongation at all, so the loop that builds an
 * erect shoot cannot express one. A branch inside that loop would be the
 * wrong shape of change, so each habit is its own loop behind this door.
 *
 * `buildShoot` is untouched and remains the erect implementation.
 */
export function grow(
  phenotype: Phenotype,
  species: SpeciesTemplate,
  seed: string,
): Shoot {
  const geometry = shootGeometry(phenotype, species, seed)
  return growthFormOf(phenotype) === 'rosette'
    ? growRosette(geometry, seed)
    : buildShoot({ ...geometry, seed })
}

/**
 * A rosette: a compressed crown with leaves radiating from it.
 *
 * The payoff of the research's "nearly free" claim, made concrete. There is no
 * new maths here. A rosette is the existing leaf placement with elongation
 * switched off and the divergence widened, so the leaves all emerge at one
 * height and fan out flat instead of climbing a stem.
 *
 * The crown is a very short internode rather than none, because that is what a
 * compressed stem is, and because placement needs a node to attach to.
 */
export function growRosette(geometry: ShootGeometry, seed: string): Shoot {
  const CROWN_LENGTH = 0.15
  const internodes: Organ[] = [
    makeOrgan('internode', { x: 0, y: 0, angle: 0, scale: 1 }, CROWN_LENGTH, 0.1),
  ]

  // A rosette carries more leaves than an erect shoot of the same stature,
  // because the leaves are the whole plant rather than appendages on an axis.
  const count = Math.max(5, Math.round(geometry.nodes * 1.8))
  const leaves: Organ[] = []
  for (let i = 0; i < count; i += 1) {
    const r = rngFrom(`rosette|${seed}|${i}`)
    const azimuth = nextBudAngle(geometry.pattern, i)
    const length = geometry.leafLength * (0.85 + r() * 0.3)
    const divergence = geometry.divergenceDeg * (0.9 + r() * 0.2)
    const projected = projectLeaf(azimuth, divergence)
    leaves.push(
      makeOrgan(
        'leaf',
        { x: 0, y: CROWN_LENGTH, angle: projected.angle, scale: projected.scale },
        length,
        geometry.leafWidth,
      ),
    )
  }

  // A rosette does not branch. Offsets come from stolons or rhizomes, which are
  // other growth forms and not this one.
  return { internodes, leaves, branches: [] }
}
