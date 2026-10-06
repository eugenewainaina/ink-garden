import type { Phenotype } from '../phenotype.ts'
import type { SpeciesTemplate } from '../species.ts'
import { dayLengthHours } from './solar.ts'
import {
  advanceThermal,
  EMPTY_THERMAL,
  upperThresholdC,
  type ThermalState,
} from './thermal.ts'
import type { WeatherDay } from './weather.ts'

export type Stage =
  | 'germination'
  | 'juvenile'
  | 'vegetative'
  | 'bud'
  | 'bloom'
  | 'seed'
  | 'senescence'
  | 'dormancy'

export interface Phenology {
  readonly stage: Stage
  /** Progress through the current stage, 0 to 1. */
  readonly progress: number
}

/**
 * Where each thermal stage begins, as a fraction of the species thermal budget.
 *
 * M0b drives germination through to bloom and stops there. `seed`,
 * `senescence` and `dormancy` are in the union because the lifecycle needs them
 * (spec §5.4), but they are **not** driven by accumulated warmth: a plant does
 * not senesce because it got hotter. They are triggered by season, which is
 * M1's job alongside growth over real time. Nothing in M0b returns them.
 *
 * The boundaries are derived from the behaviour we want rather than picked
 * round: a budget of 1400 must reach `bloom` at 1500 accumulated, which fixes
 * the bloom start between 0.95 and 1.05.
 */
const STAGE_STARTS: ReadonlyArray<readonly [Stage, number]> = [
  ['germination', 0],
  ['juvenile', 0.02],
  ['vegetative', 0.15],
  ['bud', 0.75],
  ['bloom', 0.95],
]

const winner = (p: Phenotype, id: string): string => p.discrete[id]?.expressed[0] ?? ''
const trait = (p: Phenotype, id: string): number => p.quantitative[id] ?? 0

/**
 * Where the plant is in its life.
 *
 * Warmth gets a plant to `bud`. Opening is a separate gate, because a plant
 * that has accumulated enough warmth but sees the wrong daylength, or has had
 * too little chilling, holds at bud rather than flowering. That gate is what
 * makes bloom time predictable and explainable, which spec §5.2 requires, and
 * it is also why a species can be bred into an early line or a late one.
 */
export function phenologyAt(
  thermal: ThermalState,
  phenotype: Phenotype,
  species: SpeciesTemplate,
  dayLength: number,
): Phenology {
  const budget = species.baseline.thermalConstant
  const fraction = budget <= 0 ? 1 : thermal.accumulated / budget

  // The last stage whose start we have passed.
  let stage: Stage = 'germination'
  let start = 0
  let end = STAGE_STARTS[1]?.[1] ?? 1
  for (let i = 0; i < STAGE_STARTS.length; i += 1) {
    const entry = STAGE_STARTS[i]
    if (entry === undefined || fraction < entry[1]) break
    stage = entry[0]
    start = entry[1]
    end = STAGE_STARTS[i + 1]?.[1] ?? entry[1] + 0.2
  }

  if (stage === 'bloom') {
    const response = winner(phenotype, 'photoperiod.response')
    const critical = trait(phenotype, 'photoperiod.critical')
    const dayOk =
      response === 'day.neutral' ||
      (response === 'long.day' && dayLength >= critical) ||
      (response === 'short.day' && dayLength <= critical)

    const needsChill = winner(phenotype, 'vernalization.required') === 'required'
    const chillOk =
      !needsChill || thermal.chilledHours >= trait(phenotype, 'vernalization.hours')

    if (!dayOk || !chillOk) {
      // Ready, but the season is not. Hold at bud.
      stage = 'bud'
      start = STAGE_STARTS[3]?.[1] ?? 0.75
      end = STAGE_STARTS[4]?.[1] ?? 0.95
    }
  }

  const span = end - start
  const progress = span <= 0 ? 1 : Math.max(0, Math.min(1, (fraction - start) / span))
  return { stage, progress }
}

/** Life stages in order. Used to compare and to latch. */
export const STAGE_ORDER: readonly Stage[] = [
  'germination',
  'juvenile',
  'vegetative',
  'bud',
  'bloom',
  'seed',
  'senescence',
  'dormancy',
]

/** How far along a stage is, for comparison. */
export function stageRank(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage)
}

/**
 * The further of two phenologies.
 *
 * A plant that has flowered has flowered. It must not return to bud because the
 * daylength changed afterwards, and it must not regress because a cold spell
 * slowed accumulation. Growth is cumulative, so the stage is too.
 */
export function furthestPhenology(a: Phenology, b: Phenology): Phenology {
  return stageRank(b.stage) >= stageRank(a.stage) ? b : a
}

/**
 * Run the stage machine over a real weather series, day by day.
 *
 * This is the function `develop` should call, and the reason it exists is a bug
 * worth recording. Evaluating the gate once against the *total* accumulated
 * warmth applies the final day's daylength to the whole season, so a plant sown
 * in spring is judged by the light of the last day of the run. And evaluating
 * it repeatedly without latching lets a plant bloom and then un-bloom as the
 * days shorten.
 *
 * So: accumulate one day at a time, test the gate with that day's real
 * daylength, and latch the furthest stage reached.
 */
export function phenologyOver(
  series: readonly WeatherDay[],
  phenotype: Phenotype,
  species: SpeciesTemplate,
  latitudeDeg: number,
): Phenology {
  const base = phenotype.quantitative['thermal.base_temp'] ?? species.baseline.thermalBase
  const upper = upperThresholdC(base)

  let best: Phenology = { stage: 'germination', progress: 0 }
  let thermal: ThermalState = EMPTY_THERMAL

  for (const day of series) {
    // One day at a time, through the thermal module. Never re-implemented here.
    thermal = advanceThermal(thermal, day, base, upper)
    const here = phenologyAt(
      thermal,
      phenotype,
      species,
      dayLengthHours(day.dayOfYear, latitudeDeg),
    )
    best = furthestPhenology(best, here)
  }

  return best
}
