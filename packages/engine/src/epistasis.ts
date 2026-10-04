import type { MutablePhenotype } from './phenotype.ts'

export interface EpistasisRule {
  readonly id: string
  readonly when: (phenotype: MutablePhenotype) => boolean
  readonly apply: (phenotype: MutablePhenotype) => void
}

const winner = (p: MutablePhenotype, locusId: string): string =>
  p.discrete[locusId]?.expressed[0] ?? ''

const trait = (p: MutablePhenotype, key: string): number => p.quantitative[key] ?? 0

/** Rotate `from` toward `to` by `amount` in [0, 1], the short way round the wheel. */
function rotateHue(from: number, to: number, amount: number): number {
  const delta = ((to - from + 540) % 360) - 180
  const moved = from + delta * amount
  return (moved + 360) % 360
}

/** Base hues for each anthocyanidin branch, in degrees. */
const ANTHOCYANIDIN_HUE: Readonly<Record<string, number>> = {
  none: 0,
  pelargonidin: 18,
  cyanidin: 332,
  delphinidin: 288,
}

/** Base hue for each carotenoid allele. */
const CAROTENOID_HUE: Readonly<Record<string, number>> = {
  none: 0,
  yellow: 52,
  orange: 32,
  red: 8,
}

/**
 * The rule table. Order matters: later rules read what earlier ones wrote.
 * Every rule is a pure function of the phenotype it is handed.
 */
export const EPISTASIS: readonly EpistasisRule[] = [
  {
    id: 'colour.anthocyanidin.base',
    when: (p) => winner(p, 'pigment.anthocyanidin') !== 'none',
    apply: (p) => {
      const branch = winner(p, 'pigment.anthocyanidin')
      p.quantitative['pigment.hue'] = ANTHOCYANIDIN_HUE[branch] ?? 0
      const intensity = trait(p, 'pigment.intensity')
      p.quantitative['pigment.saturation'] = 0.25 + 0.65 * Math.min(1, intensity)
      p.quantitative['pigment.lightness'] = 0.72 - 0.25 * Math.min(1, intensity)
    },
  },
  {
    id: 'colour.carotenoid.base',
    when: (p) =>
      winner(p, 'pigment.carotenoid') !== 'none' &&
      winner(p, 'pigment.anthocyanidin') === 'none' &&
      winner(p, 'pigment.petal.chlorophyll') === 'none',
    apply: (p) => {
      const branch = winner(p, 'pigment.carotenoid')
      p.quantitative['pigment.hue'] = CAROTENOID_HUE[branch] ?? 50
      p.quantitative['pigment.saturation'] = 0.7
      p.quantitative['pigment.lightness'] = 0.62
    },
  },
  {
    id: 'colour.carotenoid.overlay',
    when: (p) =>
      winner(p, 'pigment.carotenoid') !== 'none' &&
      winner(p, 'pigment.anthocyanidin') !== 'none' &&
      winner(p, 'pigment.petal.chlorophyll') === 'none',
    apply: (p) => {
      // Anthocyanin laid over yellow reads as bronze, brick or russet.
      const branch = winner(p, 'pigment.carotenoid')
      p.quantitative['pigment.hue'] = rotateHue(
        trait(p, 'pigment.hue'),
        CAROTENOID_HUE[branch] ?? 50,
        0.3,
      )
      p.quantitative['pigment.saturation'] = Math.min(
        1,
        trait(p, 'pigment.saturation') + 0.2,
      )
    },
  },
  {
    id: 'colour.petal.chlorophyll',
    when: (p) => winner(p, 'pigment.petal.chlorophyll') === 'green',
    apply: (p) => {
      p.quantitative['pigment.hue'] = 104
      p.quantitative['pigment.saturation'] = 0.32
      p.quantitative['pigment.lightness'] = 0.68
    },
  },
  {
    id: 'colour.copigment.shift',
    when: (p) =>
      trait(p, 'pigment.copigment') > 0.45 &&
      winner(p, 'pigment.anthocyanidin') !== 'none' &&
      winner(p, 'pigment.petal.chlorophyll') !== 'green',
    apply: (p) => {
      const strength = Math.min(1, (trait(p, 'pigment.copigment') - 0.45) / 0.55)
      p.quantitative['pigment.hue'] = rotateHue(
        trait(p, 'pigment.hue'),
        250,
        strength * 0.45,
      )
      p.quantitative['pigment.saturation'] = Math.min(
        1,
        trait(p, 'pigment.saturation') + 0.1,
      )
    },
  },
  {
    id: 'colour.vacuolar.ph.shift',
    when: (p) =>
      trait(p, 'pigment.vacuolar.ph') > 0.5 &&
      winner(p, 'pigment.anthocyanidin') === 'delphinidin' &&
      winner(p, 'pigment.petal.chlorophyll') !== 'green',
    apply: (p) => {
      // Only the delphinidin branch can be pushed to true blue. This is the
      // real constraint: there was no blue rose until the pathway was
      // engineered.
      const strength = Math.min(1, (trait(p, 'pigment.vacuolar.ph') - 0.5) / 0.5)
      p.quantitative['pigment.hue'] = rotateHue(
        trait(p, 'pigment.hue'),
        232,
        strength * 0.7,
      )
    },
  },
  {
    id: 'flower.doubling.expands',
    when: (p) => winner(p, 'flower.doubling') === 'double',
    apply: (p) => {
      // Homeotic conversion of stamens into petals: more petals, less seed.
      p.quantitative['petal.count'] = trait(p, 'petal.count') * 1.9
      p.quantitative['flower.fertility'] = 0.4
    },
  },
]

/** Apply every rule whose condition holds, in order. Mutates and returns. */
export function applyEpistasis(phenotype: MutablePhenotype): MutablePhenotype {
  for (const rule of EPISTASIS) {
    if (rule.when(phenotype)) rule.apply(phenotype)
  }
  return phenotype
}
