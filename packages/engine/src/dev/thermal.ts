import type { WeatherDay } from './weather.ts'

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

export function accumulateThermal(
  series: readonly WeatherDay[],
  baseC: number,
  upperC: number,
  chillThresholdC = 5,
): ThermalState {
  let accumulated = 0
  let chilledHours = 0
  for (const day of series) {
    accumulated += degreeDays(day, baseC, upperC)
    chilledHours += chillingHours(day, chillThresholdC)
  }
  return { accumulated, days: series.length, chilledHours }
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
