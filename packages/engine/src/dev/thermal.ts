import type { WeatherDay } from './weather.ts'

/**
 * The default temperature below which time counts as chilling.
 *
 * Named rather than repeated, because it was previously written as a literal 5
 * in two modules and the second copy is exactly the kind of thing that diverges.
 */
export const DEFAULT_CHILL_THRESHOLD_C = 5

/**
 * How far above the base temperature development stops accelerating.
 *
 * A simplification. Real upper thresholds are closer to absolute temperatures
 * than to offsets from the base, but this is honest for a garden.
 */
export const UPPER_THRESHOLD_MARGIN_C = 30

/** The upper threshold that pairs with a given base temperature. */
export function upperThresholdC(baseC: number): number {
  return baseC + UPPER_THRESHOLD_MARGIN_C
}

/** Accumulated growing degree days, elapsed days, and accumulated chilling. */
export interface ThermalState {
  readonly accumulated: number
  readonly days: number
  readonly chilledHours: number
}

/**
 * Growing degree days for one day.
 *
 * `clamp(mean - base, 0, upper - base)`. The upper threshold matters: without
 * it a heatwave would accelerate development without limit, which is not what
 * plants do. Warm nights are also excluded, which is why the mean is used
 * rather than the maximum.
 */
export function degreeDays(day: WeatherDay, baseC: number, upperC: number): number {
  const mean = (day.tMinC + day.tMaxC) / 2
  return Math.max(0, Math.min(upperC - baseC, mean - baseC))
}

/**
 * Hours below a chilling threshold, approximated from the daily range.
 *
 * Real chilling is measured hourly. This is the standard daily approximation:
 * assume the temperature ramps linearly from the minimum to the maximum, and
 * count the fraction of the day below the threshold.
 */
export function chillingHours(day: WeatherDay, thresholdC: number): number {
  if (day.tMaxC <= thresholdC) return 24
  if (day.tMinC >= thresholdC) return 0
  const span = day.tMaxC - day.tMinC
  if (span <= 0) return 24
  const fraction = (thresholdC - day.tMinC) / span
  return 24 * Math.max(0, Math.min(1, fraction))
}

/** A thermal state before any day has passed. */
export const EMPTY_THERMAL: ThermalState = { accumulated: 0, days: 0, chilledHours: 0 }

/**
 * Advance a thermal budget by one day.
 *
 * This exists so that a simulation which grows a plant day by day can reuse the
 * same arithmetic as `accumulateThermal`, rather than writing it out again. It
 * was written out again once, in phenology.ts, with the thresholds as bare
 * literals, which meant the thermal module's tests passed while the code that
 * actually ran during growth was a separate untested copy.
 */
export function advanceThermal(
  state: ThermalState,
  day: WeatherDay,
  baseC: number,
  upperC: number,
  chillThresholdC = DEFAULT_CHILL_THRESHOLD_C,
): ThermalState {
  return {
    accumulated: state.accumulated + degreeDays(day, baseC, upperC),
    days: state.days + 1,
    chilledHours: state.chilledHours + chillingHours(day, chillThresholdC),
  }
}

export function accumulateThermal(
  series: readonly WeatherDay[],
  baseC: number,
  upperC: number,
  chillThresholdC = DEFAULT_CHILL_THRESHOLD_C,
): ThermalState {
  let state = EMPTY_THERMAL
  for (const day of series) {
    state = advanceThermal(state, day, baseC, upperC, chillThresholdC)
  }
  return state
}

/**
 * The index of the day on which a thermal target is reached, or null if it is
 * not reached within the series.
 *
 * This is how bloom time is promised in advance (spec §5.2). The card says a
 * flower blooms on a date, and this is the function that knows the date.
 */
export function dayReachingTarget(
  series: readonly WeatherDay[],
  targetGdd: number,
  baseC: number,
  upperC: number,
): number | null {
  let accumulated = 0
  for (let i = 0; i < series.length; i += 1) {
    const day = series[i]
    if (day === undefined) break
    // Accumulate first, then test. Testing before accumulating returns the day
    // *after* the threshold is crossed, which is a one-day error in a promise
    // the specimen card makes to the user.
    accumulated += degreeDays(day, baseC, upperC)
    if (accumulated >= targetGdd) return i
  }
  return null
}
