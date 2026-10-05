import { rngFrom } from '../rng.ts'
import { dayLengthHours } from './solar.ts'

/** One day of weather. The shape used by the weather_days table in the spec. */
export interface WeatherDay {
  readonly dayOfYear: number
  readonly date: string
  readonly tMinC: number
  readonly tMaxC: number
  readonly precipMm: number
  readonly sunshineHours: number
}

/** Linear interpolation through a table of [x, y] pairs, clamped at the ends. */
function interpolate(
  table: ReadonlyArray<readonly [number, number]>,
  x: number,
): number {
  const first = table[0]
  const last = table[table.length - 1]
  if (first === undefined || last === undefined) return 0
  if (x <= first[0]) return first[1]
  if (x >= last[0]) return last[1]
  for (let i = 1; i < table.length; i += 1) {
    const hi = table[i]
    const lo = table[i - 1]
    if (hi === undefined || lo === undefined) continue
    if (x <= hi[0]) {
      const span = hi[0] - lo[0]
      const t = span <= 0 ? 0 : (x - lo[0]) / span
      return lo[1] + (hi[1] - lo[1]) * t
    }
  }
  return last[1]
}

/**
 * Annual mean temperature by latitude, fitted to real values rather than
 * derived from a formula. A linear fit gives Glasgow about -4 C, which is
 * absurd; a table does not.
 *
 * Continentality is deliberately not modelled, so maritime places come out
 * with slightly colder winters than reality. This is a fallback (spec §7.7),
 * replaced wholesale by Open-Meteo at M5.
 */
const MEAN_TEMPERATURE_C: ReadonlyArray<readonly [number, number]> = [
  [0, 26],
  [10, 26.5],
  [20, 24],
  [30, 19],
  [40, 15],
  [50, 11],
  [60, 6],
  [70, 0],
  [80, -10],
  [90, -18],
]

/**
 * Half the seasonal swing of the daily mean, by latitude. Kept on the mild
 * side: continental interiors swing far more, but over-estimating cold would
 * trigger dormancy that should not happen.
 */
const SEASONAL_AMPLITUDE_C: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [10, 1.5],
  [20, 3],
  [30, 4.5],
  [40, 5],
  [50, 5.5],
  [60, 6.5],
  [70, 8],
  [80, 9],
  [90, 10],
]

/**
 * Baseline chance of a wet day, from atmospheric circulation.
 *
 * Wet at the equator where the Hadley cells rise, dry in the subtropical high
 * around 25 to 30 degrees where they descend, wet again in the mid-latitude
 * storm track. Without this, every latitude would rain as much as every other,
 * which is the least plausible thing a weather model can do.
 */
function baselineWetness(latitudeDeg: number): number {
  const a = Math.abs(latitudeDeg)
  if (a <= 8) return 0.55
  if (a <= 28) return 0.55 - 0.45 * ((a - 8) / 20)
  if (a <= 48) return 0.1 + 0.35 * ((a - 28) / 20)
  return Math.min(0.6, 0.45 + 0.1 * ((a - 48) / 20))
}

/**
 * Surface lapse rate in Celsius per 1000 metres.
 *
 * Not the free-air 6.5, which is for a rising parcel. The observed difference
 * between Mombasa at sea level (mean 27 C) and Nairobi at 1,795 m (mean 19 C)
 * is about 4.6, because a plateau is moderated by its surroundings. Five is a
 * round value between the two, chosen so highland tropical cities are not
 * wildly wrong, which matters because the garden can be placed in Nairobi.
 */
const LAPSE_RATE_C_PER_KM = 5

/** Mean temperature for a day, before daily noise. Peak lags the solstice. */
function seasonalMeanC(
  dayOfYear: number,
  latitudeDeg: number,
  elevationM: number,
): number {
  const mean =
    interpolate(MEAN_TEMPERATURE_C, Math.abs(latitudeDeg)) -
    (elevationM / 1000) * LAPSE_RATE_C_PER_KM
  const amplitude = interpolate(SEASONAL_AMPLITUDE_C, Math.abs(latitudeDeg))
  // Northern peak in mid-July, southern in mid-January.
  const phase = latitudeDeg >= 0 ? 202 : 20
  return mean + amplitude * Math.cos((2 * Math.PI * (dayOfYear - phase)) / 365)
}

const MONTH_LENGTHS: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Whole-year date stamp. Year 0001 is a stand-in; only month and day matter. */
function stamp(dayOfYear: number): string {
  const wrapped = ((dayOfYear - 1) % 365) + 1
  const year = 1 + Math.floor((dayOfYear - 1) / 365)
  let remaining = wrapped
  let month = 0
  while (month < 11 && remaining > (MONTH_LENGTHS[month] ?? 31)) {
    remaining -= MONTH_LENGTHS[month] ?? 31
    month += 1
  }
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(remaining).padStart(2, '0')}`
}

/**
 * A plausible day for a latitude and day of year.
 *
 * This is the offline fallback described in spec §7.7 and the source of weather
 * for the M0c gallery, which has no database. It is deliberately crude:
 * plausible is the requirement, accurate is not.
 *
 * Deterministic in `(latitude, elevation, day)`, so two devices grow the same
 * plant. Elevation matters more than it looks: Nairobi is 1,795 m and about
 * seven degrees cooler than its latitude alone would suggest, which would
 * otherwise make thermal time race and every flower open early.
 *
 * The `places` table in the spec carries latitude, longitude and timezone but
 * not elevation. Open-Meteo returns it, so it should be added at M4.
 */
export function seasonalDay(
  dayOfYear: number,
  latitudeDeg: number,
  elevationM = 0,
): WeatherDay {
  const day = ((dayOfYear - 1) % 365) + 1
  const r = rngFrom(`weather|${latitudeDeg.toFixed(2)}|${elevationM}|${day}`)
  const mean = seasonalMeanC(day, latitudeDeg, elevationM)

  // Diurnal range, then a little day-to-day noise.
  const diurnal = 6 + 4 * r()
  const tMean = mean + (r() - 0.5) * 3

  // Wet season, opposite in the two hemispheres.
  const wetPhase = latitudeDeg >= 0 ? 150 : 330
  const wetness = 0.5 + 0.5 * Math.cos((2 * Math.PI * (day - wetPhase)) / 365)
  const wetChance = baselineWetness(latitudeDeg) * (0.6 + 0.8 * wetness)
  const precipMm = r() < wetChance ? r() * 14 : 0

  // Sunshine cannot exceed the day, and cloud follows the rain.
  const dayLength = dayLengthHours(day, latitudeDeg)
  const cloud = precipMm > 0.5 ? 0.8 : 0.35
  const sunshineHours = dayLength * (1 - cloud) * (0.4 + 0.6 * r())

  return {
    dayOfYear: day,
    date: stamp(dayOfYear),
    tMinC: tMean - diurnal / 2,
    tMaxC: tMean + diurnal / 2,
    precipMm,
    sunshineHours,
  }
}

/** A run of consecutive days, wrapping the year. */
export function weatherSeries(
  days: number,
  latitudeDeg: number,
  startDayOfYear = 1,
  elevationM = 0,
): readonly WeatherDay[] {
  const out: WeatherDay[] = []
  for (let i = 0; i < days; i += 1) {
    out.push(seasonalDay(startDayOfYear + i, latitudeDeg, elevationM))
  }
  return out
}
