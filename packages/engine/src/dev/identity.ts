import type { Phenotype } from '../phenotype.ts'
import { rngFrom } from '../rng.ts'
import { makeOrgan, type Organ, type OrganKind } from './structure.ts'

/**
 * The ABC model of flower development, which is the reason the genome is a
 * hierarchy rather than a list of sliders.
 *
 * Four concentric whorls, and three classes of gene active in overlapping
 * zones. The combination present decides what each whorl becomes:
 *
 *   whorl 1   A        -> sepal
 *   whorl 2   A + B    -> petal
 *   whorl 3   B + C    -> stamen
 *   whorl 4   C        -> carpel
 *
 * A and C repress each other, which is what keeps the zones sharp. Two homeotic
 * mutations are modelled by overriding a whorl's fate: petaloid sepals (class A
 * extended) and doubling (class C lost, so whorl 3 becomes petals instead).
 *
 * Both mutations are recessive in the catalogue, which is botanically right and
 * is also why they are rare: the phenotype needs two copies of the mutant
 * allele, so it appears at roughly the square of the allele frequency.
 */
export function whorlIdentity(whorl: number, phenotype: Phenotype): OrganKind {
  if (!Number.isInteger(whorl) || whorl < 1 || whorl > 4) {
    throw new Error(`Whorl ${whorl} is outside 1 to 4`)
  }

  const petaloidSepals =
    phenotype.discrete['flower.organ.identity']?.expressed[0] === 'sepals.petaloid'
  const double = phenotype.discrete['flower.doubling']?.expressed[0] === 'double'

  if (whorl === 1) return petaloidSepals ? 'petal' : 'sepal'
  if (whorl === 2) return 'petal'
  if (whorl === 3) return double ? 'petal' : 'stamen'
  return 'carpel'
}

/** Whorls that carry petals, given the phenotype. */
export function petaloidWhorls(phenotype: Phenotype): readonly number[] {
  return [1, 2, 3, 4].filter((whorl) => whorlIdentity(whorl, phenotype) === 'petal')
}

/**
 * Radial placement of `count` organs in a whorl, starting at `phase`.
 *
 * Whorl 1 is the OUTERMOST, so radius DECREASES with whorl number: sepals
 * outside, then petals, then stamens, and the carpel at the centre. The first
 * version had this inverted, which put the carpel on the outside and the sepals
 * in the middle, and a test caught it. Without the nesting a flower is a flat
 * ring of overlapping parts rather than concentric whorls.
 */
function whorlOrgans(
  kind: OrganKind,
  count: number,
  radius: number,
  length: number,
  width: number,
  phase: number,
): readonly Organ[] {
  const organs: Organ[] = []
  for (let i = 0; i < count; i += 1) {
    const angle = phase + (i * 360) / count
    const radians = (angle * Math.PI) / 180
    organs.push(
      makeOrgan(
        kind,
        { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius, angle, scale: 1 },
        length,
        width,
      ),
    )
  }
  return organs
}

/** How many organs of each kind a whorl carries, relative to the petal count. */
function countFor(kind: OrganKind, perPetalWhorl: number, petals: number): number {
  switch (kind) {
    case 'petal':
      return Math.max(0, Math.round(perPetalWhorl))
    case 'sepal':
      return Math.max(1, Math.round(petals * 0.6))
    case 'stamen':
      // Stamens outnumber petals in most flowers. This is why doubling costs
      // fertility rather than being free.
      return Math.max(1, Math.round(petals * 1.6))
    default:
      return 1
  }
}

/**
 * Build a flower: one ring of organs per whorl, with the phenotype's total
 * petal count distributed across whichever whorls turned petaloid, so doubling
 * adds petals rather than replacing the count with a different number.
 */
export function flowerOrgans(
  phenotype: Phenotype,
  petalLength: number,
  petalWidth: number,
  seed: string,
): readonly Organ[] {
  const petals = Math.max(0, Math.round(phenotype.quantitative['petal.count'] ?? 5))
  const petalWhorls = petaloidWhorls(phenotype)
  const perPetalWhorl = petalWhorls.length === 0 ? 0 : petals / petalWhorls.length

  // A per-flower rotational phase, so two flowers of the same species are not
  // rotationally identical.
  let phase = rngFrom(`flower|${seed}`)() * 137.5

  const organs: Organ[] = []
  for (const whorl of [1, 2, 3, 4]) {
    const kind = whorlIdentity(whorl, phenotype)
    // Outermost first: whorl 1 at 0.50 down to the carpel at 0.05.
    const radius = (4 - whorl) * 0.15 + 0.05
    const count = countFor(kind, perPetalWhorl, petals)
    const length =
      kind === 'petal' ? petalLength : kind === 'sepal' ? petalLength * 0.5 : 0.3
    const width = kind === 'petal' ? petalWidth : petalWidth * 0.5
    organs.push(...whorlOrgans(kind, count, radius, length, width, phase))
    phase += 137.5
  }
  return organs
}
