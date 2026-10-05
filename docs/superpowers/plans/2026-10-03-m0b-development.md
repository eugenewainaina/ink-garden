# M0b — Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a genome and a species into a simulated plant **structure**: a tree of organs with positions, angles and sizes, grown from a meristem over simulated days of real weather.

**Architecture:** A new `packages/engine/src/dev/` area, still dependency-free and isomorphic. Phenotype (from M0a) plus a weather series drives thermal time; thermal time drives a phenology state machine; the phenology gate opens a meristem that repeatedly produces phytomers (internode + leaf + axillary bud); organ identity decides what each primordium becomes; allometry then constrains the result so it is physically plausible. Output is a `Structure`, which M0c renders. **Nothing here draws.**

**Tech Stack:** TypeScript with `erasableSyntaxOnly`, pnpm, Vitest. Same constraints as M0a.

**Spec:** `docs/superpowers/specs/2026-10-03-flower-garden-design.md` (revision 5). Read §4.9, §4.10, §5, and §7 before starting.

## Global Constraints

Inherited from M0a and still binding:

- **No runtime dependencies** in `packages/engine`.
- **`erasableSyntaxOnly` and `verbatimModuleSyntax`.** No `enum`; use `const` objects and union types. Types imported with `import type`.
- **Explicit `.ts` extensions** in all relative imports.
- **Integer-only randomness for anything derived from a genome.** All new randomness must come from `rngFrom` with a stable string seed. Never `Math.random`. The one exception is documented per task: geometry may use floating-point trigonometry, and floating-point divergence is confined to geometry and quantised in M0c.
- **Determinism is absolute.** Same inputs, same `Structure`, on every device, forever. No `Date.now()`, no locale, no unordered iteration where order affects output.
- **`tsc --noEmit` must pass**, and `pnpm test` must be green at the end of every task.
- **Nothing dies of neglect, weather never damages, and no trait is a punishment** (spec §2). Constraints thicken a stem or bend it; they never remove an organ.
- Quantisation to 1e-3 happens in M0c, not here. `Structure` carries full-precision numbers.

## Scope note

M0b produces **structure only** — no strokes, no colour, no canvas. The art gate is M0c. Keeping them separate means a geometry bug and a simulation bug are never confused for each other, which is the mistake that costs weeks in procedural art.

## File Structure

```
packages/engine/src/dev/
  solar.ts        daylength, declination, sunrise and sunset
  weather.ts      the seasonal estimator: latitude and day to a plausible day
  thermal.ts      growing degree days, chilling hours, accumulation
  phenology.ts    stage machine: germination through dormancy
  structure.ts    Organ, Transform, Structure, and traversal helpers
  meristem.ts     phyllotaxis, phytomer production, apical dominance
  identity.ts     the ABC model: what each primordium becomes
  allometry.ts    pipe model and critical buckling height
  develop.ts      the integration: genome + species + weather to Structure
  index.ts        public API for the dev area
  cli/structure.ts  print a structure summary at a given age
test/dev/
  solar.test.ts
  weather.test.ts
  thermal.test.ts
  phenology.test.ts
  structure.test.ts
  meristem.test.ts
  identity.test.ts
  allometry.test.ts
  develop.test.ts
```

One responsibility per file. `develop.ts` is the only file that imports all the others.

---

### Task 1: Solar geometry

Daylength is what photoperiod responds to, so it must be right before phenology can be. It is also the easiest thing in the whole milestone to verify against known values.

**Files:**
- Create: `packages/engine/src/dev/solar.ts`
- Test: `packages/engine/test/dev/solar.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `solarDeclinationDeg(dayOfYear)`, `dayLengthHours(dayOfYear, latitudeDeg)`, `sunTimes(dayOfYear, latitudeDeg)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/dev/solar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dayLengthHours, solarDeclinationDeg, sunTimes } from '../../src/dev/solar.ts'

const GLASGOW = 55.86
const NAIROBI = -1.29

describe('solarDeclinationDeg', () => {
  it('is near zero at the equinoxes', () => {
    expect(Math.abs(solarDeclinationDeg(80))).toBeLessThan(2)
    expect(Math.abs(solarDeclinationDeg(264))).toBeLessThan(2)
  })

  it('peaks near +23.4 at the June solstice', () => {
    expect(solarDeclinationDeg(172)).toBeGreaterThan(23)
    expect(solarDeclinationDeg(172)).toBeLessThan(23.5)
  })

  it('is near -23.4 at the December solstice', () => {
    expect(solarDeclinationDeg(355)).toBeLessThan(-23)
  })
})

describe('dayLengthHours', () => {
  it('is about twelve hours at the equator all year', () => {
    for (const day of [1, 80, 172, 264, 355]) {
      const hours = dayLengthHours(day, 0)
      expect(hours, `day ${day}`).toBeGreaterThan(11.8)
      expect(hours, `day ${day}`).toBeLessThan(12.2)
    }
  })

  it('is about twelve hours everywhere at the equinox', () => {
    for (const latitude of [-60, -30, 0, 30, 60]) {
      const hours = dayLengthHours(80, latitude)
      expect(hours, `lat ${latitude}`).toBeGreaterThan(11.6)
      expect(hours, `lat ${latitude}`).toBeLessThan(12.4)
    }
  })

  it('matches Glasgow in midsummer to within half an hour', () => {
    // Real value is about 17h34m.
    expect(dayLengthHours(172, GLASGOW)).toBeGreaterThan(17)
    expect(dayLengthHours(172, GLASGOW)).toBeLessThan(18)
  })

  it('matches Glasgow midwinter to within half an hour', () => {
    // Real value is about 7h03m.
    expect(dayLengthHours(355, GLASGOW)).toBeGreaterThan(6.6)
    expect(dayLengthHours(355, GLASGOW)).toBeLessThan(7.6)
  })

  it('is about twelve hours year round in Nairobi', () => {
    for (const day of [1, 172, 355]) {
      const hours = dayLengthHours(day, NAIROBI)
      expect(hours, `day ${day}`).toBeGreaterThan(11.8)
      expect(hours, `day ${day}`).toBeLessThan(12.4)
    }
  })

  it('is longest in June in the north and in December in the south', () => {
    expect(dayLengthHours(172, 50)).toBeGreaterThan(dayLengthHours(355, 50))
    expect(dayLengthHours(172, -50)).toBeLessThan(dayLengthHours(355, -50))
  })

  it('clamps at the poles rather than returning nonsense', () => {
    const midsummer = dayLengthHours(172, 89)
    const midwinter = dayLengthHours(355, 89)
    expect(midsummer).toBeLessThanOrEqual(24)
    expect(midsummer).toBeGreaterThan(23)
    expect(midwinter).toBeGreaterThanOrEqual(0)
    expect(midwinter).toBeLessThan(1)
    expect(Number.isFinite(dayLengthHours(172, 90))).toBe(true)
  })
})

describe('sunTimes', () => {
  it('puts sunrise before solar noon and sunset after', () => {
    const { sunrise, sunset } = sunTimes(172, GLASGOW)
    expect(sunrise).toBeGreaterThan(0)
    expect(sunrise).toBeLessThan(12)
    expect(sunset).toBeGreaterThan(12)
    expect(sunset).toBeLessThanOrEqual(24)
  })

  it('is consistent with dayLengthHours', () => {
    const { sunrise, sunset } = sunTimes(100, 40)
    expect(sunset - sunrise).toBeCloseTo(dayLengthHours(100, 40), 6)
  })

  it('is deterministic', () => {
    expect(sunTimes(200, 30)).toEqual(sunTimes(200, 30))
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test solar`
Expected: FAIL, cannot resolve `../../src/dev/solar.ts`.

- [ ] **Step 3: Implement solar.ts**

`packages/engine/src/dev/solar.ts`:

```ts
/**
 * Solar geometry. Pure, offline, no network. This is the lighting backbone and
 * also what photoperiod responds to, which is why it lives in the engine rather
 * than in the renderer (spec §7.1).
 *
 * Uses Cooper's equation for declination, which is accurate to about a degree
 * and is more than enough for a game. Verified against real daylengths for
 * Glasgow and Nairobi in the tests.
 */

const DEG = Math.PI / 180

/** Solar declination in degrees, for a day of year 1..365. */
export function solarDeclinationDeg(dayOfYear: number): number {
  return 23.44 * Math.sin(360 * ((284 + dayOfYear) / 365) * DEG)
}

/**
 * Daylength in hours. Clamped for polar day and night, and for exactly 90
 * degrees of latitude, where the tangent is undefined.
 */
export function dayLengthHours(dayOfYear: number, latitudeDeg: number): number {
  const lat = Math.max(-89.999, Math.min(89.999, latitudeDeg))
  const cosHourAngle =
    -Math.tan(lat * DEG) * Math.tan(solarDeclinationDeg(dayOfYear) * DEG)
  if (cosHourAngle <= -1) return 24
  if (cosHourAngle >= 1) return 0
  const hourAngleDeg = Math.acos(cosHourAngle) / DEG
  return (2 * hourAngleDeg) / 15
}

/** Sunrise and sunset as hours after local solar midnight. */
export function sunTimes(
  dayOfYear: number,
  latitudeDeg: number,
): { readonly sunrise: number; readonly sunset: number } {
  const length = dayLengthHours(dayOfYear, latitudeDeg)
  const sunrise = 12 - length / 2
  return { sunrise, sunset: sunrise + length }
}

/** Solar altitude in degrees at a given hour, for lighting. */
export function solarAltitudeDeg(
  dayOfYear: number,
  latitudeDeg: number,
  hour: number,
): number {
  const lat = latitudeDeg * DEG
  const dec = solarDeclinationDeg(dayOfYear) * DEG
  const hourAngle = (hour - 12) * 15 * DEG
  const sinAltitude =
    Math.sin(lat) * Math.sin(dec) +
    Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)
  return Math.asin(Math.max(-1, Math.min(1, sinAltitude))) / DEG
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test solar && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS. If the Glasgow values are off by more than half an hour, the declination formula is wrong, not the test.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/dev/solar.ts packages/engine/test/dev/solar.test.ts
git commit -m "feat(engine): solar geometry, verified against real daylengths"
```

---

### Task 2: The seasonal weather estimator

There is no database and no network at M0b, and M0c's gallery needs weather to grow anything. This is also the offline fallback the spec already requires (§7.7), so it is not throwaway: the same function serves the gallery and a disconnected user.

The bar is **plausible**, not accurate. It must be deterministic, seasonal, and correctly hemispheric.

**Files:**
- Create: `packages/engine/src/dev/weather.ts`
- Test: `packages/engine/test/dev/weather.test.ts`

**Interfaces:**
- Consumes: `rngFrom` from `../rng.ts`
- Produces: `WeatherDay`, `seasonalDay(dayOfYear, latitudeDeg)`, `weatherSeries(days, latitudeDeg, startDayOfYear)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/dev/weather.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { seasonalDay, weatherSeries } from '../../src/dev/weather.ts'

const GLASGOW = 55.86
const NAIROBI = -1.29

describe('seasonalDay', () => {
  it('is deterministic', () => {
    expect(seasonalDay(100, GLASGOW)).toEqual(seasonalDay(100, GLASGOW))
  })

  it('always has a maximum at or above the minimum', () => {
    for (let day = 1; day <= 365; day += 7) {
      for (const lat of [GLASGOW, NAIROBI, 0, -40]) {
        const d = seasonalDay(day, lat)
        expect(d.tMaxC, `day ${day} lat ${lat}`).toBeGreaterThanOrEqual(d.tMinC)
      }
    }
  })

  it('produces plausible temperatures, never absurd ones', () => {
    for (let day = 1; day <= 365; day += 3) {
      for (const lat of [89, 45, 0, -45, -89]) {
        const d = seasonalDay(day, lat)
        expect(d.tMinC).toBeGreaterThan(-60)
        expect(d.tMaxC).toBeLessThan(55)
      }
    }
  })

  it('is warmer in July than January in the north, and the reverse in the south', () => {
    const northJuly = seasonalDay(202, 55)
    const northJan = seasonalDay(15, 55)
    expect(northJuly.tMaxC).toBeGreaterThan(northJan.tMaxC)

    const southJuly = seasonalDay(202, -55)
    const southJan = seasonalDay(15, -55)
    expect(southJuly.tMaxC).toBeLessThan(southJan.tMaxC)
  })

  it('has a smaller seasonal swing near the equator', () => {
    const swing = (lat: number): number =>
      Math.abs(seasonalDay(202, lat).tMaxC - seasonalDay(15, lat).tMaxC)
    expect(swing(0)).toBeLessThan(swing(55))
  })

  it('never reports negative rain or sunshine', () => {
    for (let day = 1; day <= 365; day += 5) {
      const d = seasonalDay(day, GLASGOW)
      expect(d.precipMm).toBeGreaterThanOrEqual(0)
      expect(d.sunshineHours).toBeGreaterThanOrEqual(0)
    }
  })

  it('gives Glasgow plenty of rain, because it is Glasgow', () => {
    let wet = 0
    let total = 0
    for (let day = 1; day <= 365; day += 1) {
      total += 1
      if (seasonalDay(day, GLASGOW).precipMm > 0.1) wet += 1
    }
    expect(wet / total).toBeGreaterThan(0.35)
  })

  it('names the date', () => {
    expect(seasonalDay(1, 0).date).toBe('0001-01-01')
    expect(seasonalDay(365, 0).date).toBe('0001-12-31')
  })
})

describe('weatherSeries', () => {
  it('returns the requested number of days, in order, wrapping the year', () => {
    const series = weatherSeries(10, GLASGOW, 360)
    expect(series.length).toBe(10)
    expect(series[0]?.date).toBe('0001-12-26')
    expect(series[9]?.date).toBe('0002-01-04')
  })

  it('is deterministic', () => {
    expect(weatherSeries(20, GLASGOW, 100)).toEqual(weatherSeries(20, GLASGOW, 100))
  })

  it('differs between latitudes, because the climate does', () => {
    const a = weatherSeries(30, GLASGOW, 100)
    const b = weatherSeries(30, NAIROBI, 100)
    expect(a).not.toEqual(b)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test weather`
Expected: FAIL, cannot resolve the module.

- [ ] **Step 3: Implement weather.ts**

`packages/engine/src/dev/weather.ts`:

```ts
import { rngFrom } from '../rng.ts'

/** One day of weather. The shape used by the weather_days table in the spec. */
export interface WeatherDay {
  readonly dayOfYear: number
  readonly date: string
  readonly tMinC: number
  readonly tMaxC: number
  readonly precipMm: number
  readonly sunshineHours: number
}

/** Annual mean temperature at a latitude, in Celsius. Crude on purpose. */
function annualMeanC(latitudeDeg: number): number {
  return 27 - 0.55 * Math.abs(latitudeDeg)
}

/** Half the seasonal swing, in Celsius. Grows with latitude. */
function seasonalAmplitudeC(latitudeDeg: number): number {
  return 2 + 0.28 * Math.abs(latitudeDeg)
}

/** Mean temperature for a day, before daily noise. Peak lags the solstice. */
function seasonalMeanC(dayOfYear: number, latitudeDeg: number): number {
  const amplitude = seasonalAmplitudeC(latitudeDeg)
  const phase = latitudeDeg >= 0 ? 202 : 20
  return (
    annualMeanC(latitudeDeg) +
    amplitude * Math.cos((2 * Math.PI * (dayOfYear - phase)) / 365)
  )
}

/** Whole-year date stamp. Year 0001 is a stand-in; only month and day matter. */
function stamp(dayOfYear: number): string {
  const wrapped = ((dayOfYear - 1) % 365) + 1
  const year = 1 + Math.floor((dayOfYear - 1) / 365)
  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let remaining = wrapped
  let month = 0
  while (month < 11 && remaining > (monthLengths[month] ?? 31)) {
    remaining -= monthLengths[month] ?? 31
    month += 1
  }
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(remaining).padStart(2, '0')
  return `${String(year).padStart(4, '0')}-${mm}-${dd}`
}

/**
 * A plausible day for a latitude and day of year.
 *
 * This is the offline fallback described in spec §7.7 and the source of weather
 * for the M0c gallery, which has no database. It is deliberately crude:
 * plausible is the requirement, accurate is not. Real weather comes from
 * Open-Meteo via the cron and replaces this wholesale.
 */
export function seasonalDay(dayOfYear: number, latitudeDeg: number): WeatherDay {
  const day = ((dayOfYear - 1) % 365) + 1
  const r = rngFrom(`weather|${latitudeDeg.toFixed(2)}|${day}`)
  const mean = seasonalMeanC(day, latitudeDeg)

  // Diurnal range is wider inland and in summer; keep it simple and bounded.
  const diurnal = 6 + 4 * r()
  const noise = (r() - 0.5) * 3
  const tMean = mean + noise

  // Wet season: a broad band that differs between hemispheres.
  const wetPhase = latitudeDeg >= 0 ? 150 : 330
  const wetness = 0.5 + 0.5 * Math.cos((2 * Math.PI * (day - wetPhase)) / 365)
  const precipRoll = r()
  const precipMm = precipRoll < wetness * 0.55 ? r() * 14 : 0

  const cloudy = precipMm > 0.5 ? 0.8 : 0.35
  const daylengthFraction = 0.55
  const sunshineHours = Math.max(0, (1 - cloudy) * 24 * daylengthFraction * (0.5 + r() * 0.5))

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
): readonly WeatherDay[] {
  const out: WeatherDay[] = []
  for (let i = 0; i < days; i += 1) {
    out.push(seasonalDay(startDayOfYear + i, latitudeDeg))
  }
  return out
}
```

Note: the test asserts Glasgow rain on more than 35% of days and that rainy days are the minority. If the wetness constants above do not satisfy both, tune `wetness * 0.55` rather than relaxing the test; the test is asserting a real property of the climate.

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test weather && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/dev/weather.ts packages/engine/test/dev/weather.test.ts
git commit -m "feat(engine): deterministic seasonal weather estimator

The offline fallback from spec 7.7, and the weather source for the M0c
gallery, which has no database. Plausible rather than accurate: real
weather replaces it wholesale via the cron."
```

---

### Task 3: Thermal time

Development runs on accumulated warmth, not the calendar (spec §5.2). This is the clock everything else hangs off.

**Files:**
- Create: `packages/engine/src/dev/thermal.ts`
- Test: `packages/engine/test/dev/thermal.test.ts`

**Interfaces:**
- Consumes: `WeatherDay` from `./weather.ts`
- Produces: `ThermalState`, `degreeDays(day, baseC, upperC)`, `chillingHours(day, thresholdC)`, `accumulateThermal(series, baseC, upperC, chillThresholdC)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/dev/thermal.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { accumulateThermal, chillingHours, degreeDays } from '../../src/dev/thermal.ts'
import type { WeatherDay } from '../../src/dev/weather.ts'

const day = (tMinC: number, tMaxC: number): WeatherDay => ({
  dayOfYear: 1,
  date: '0001-01-01',
  tMinC,
  tMaxC,
  precipMm: 0,
  sunshineHours: 8,
})

describe('degreeDays', () => {
  it('is zero when the mean is at or below the base temperature', () => {
    expect(degreeDays(day(2, 8), 10, 35)).toBe(0)
    expect(degreeDays(day(10, 10), 10, 35)).toBe(0)
  })

  it('is the mean above base when within range', () => {
    // mean 20, base 10
    expect(degreeDays(day(15, 25), 10, 35)).toBeCloseTo(10, 10)
  })

  it('is capped by the upper threshold', () => {
    // mean 40, base 10, upper 35 -> capped at 25
    expect(degreeDays(day(35, 45), 10, 35)).toBeCloseTo(25, 10)
  })

  it('never goes negative', () => {
    for (const [lo, hi] of [[-10, -2], [0, 5], [30, 42]]) {
      expect(degreeDays(day(lo ?? 0, hi ?? 0), 12, 34)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('chillingHours', () => {
  it('counts a full day when the mean is below the threshold', () => {
    expect(chillingHours(day(-2, 4), 5)).toBe(24)
  })

  it('counts nothing when the minimum is above the threshold', () => {
    expect(chillingHours(day(8, 16), 5)).toBe(0)
  })

  it('counts part of a day when the threshold falls inside the range', () => {
    // range -1..9, threshold 5 -> the colder half of the range counts
    const hours = chillingHours(day(-1, 9), 5)
    expect(hours).toBeGreaterThan(0)
    expect(hours).toBeLessThan(24)
  })
})

describe('accumulateThermal', () => {
  it('sums degree days over a series', () => {
    const series = [day(15, 25), day(15, 25), day(15, 25)]
    expect(accumulateThermal(series, 10, 35).accumulated).toBeCloseTo(30, 10)
  })

  it('counts the days and the chilling', () => {
    const series = [day(-2, 4), day(15, 25)]
    const state = accumulateThermal(series, 10, 35, 5)
    expect(state.days).toBe(2)
    expect(state.chilledHours).toBe(24)
  })

  it('is zero for an empty series', () => {
    expect(accumulateThermal([], 10, 35).accumulated).toBe(0)
  })

  it('is monotonic in the series length', () => {
    const warm = day(20, 30)
    let previous = -1
    for (let n = 0; n < 8; n += 1) {
      const value = accumulateThermal(new Array<WeatherDay>(n).fill(warm), 10, 35)
        .accumulated
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test thermal`

- [ ] **Step 3: Implement thermal.ts**

`packages/engine/src/dev/thermal.ts`:

```ts
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
 * plants do.
 */
export function degreeDays(day: WeatherDay, baseC: number, upperC: number): number {
  const mean = (day.tMinC + day.tMaxC) / 2
  return Math.max(0, Math.min(upperC - baseC, mean - baseC))
}

/**
 * Hours below a chilling threshold, approximated from the daily range. Real
 * chilling is measured hourly; this is the standard daily approximation and is
 * enough to make vernalisation behave.
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
 * The day index at which a thermal target is reached, or null if it is not
 * reached within the series. Used to predict bloom time, which the specimen
 * card promises in advance (spec §5.2).
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
    accumulated += degreeDays(day, baseC, upperC)
    if (accumulated >= targetGdd) return i
  }
  return null
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test thermal && pnpm --filter @ink-garden/engine typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/dev/thermal.ts packages/engine/test/dev/thermal.test.ts
git commit -m "feat(engine): thermal time, chilling hours, and bloom prediction"
```

---

### Task 4: The phenology state machine

**Files:**
- Create: `packages/engine/src/dev/phenology.ts`
- Test: `packages/engine/test/dev/phenology.test.ts`

**Interfaces:**
- Consumes: `ThermalState` from `./thermal.ts`; `Phenotype` from `../phenotype.ts`; `SpeciesTemplate` from `../species.ts`
- Produces: `Stage`, `Phenology`, `phenologyAt(thermal, phenotype, species, dayLengthHours, juvenileFraction)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/dev/phenology.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { phenologyAt } from '../../src/dev/phenology.ts'
import type { ThermalState } from '../../src/dev/thermal.ts'
import { DERIVED_TRAITS, type MutablePhenotype } from '../../src/phenotype.ts'
import { ROSEMARY, type SpeciesTemplate } from '../../src/species.ts'

const state = (accumulated: number, chilledHours = 0): ThermalState => ({
  accumulated,
  days: 10,
  chilledHours,
})

/** A phenotype with only the traits phenology reads. */
function phenotype(overrides: Partial<Record<string, number>> = {}): MutablePhenotype {
  return {
    discrete: {
      'photoperiod.response': {
        expressed: ['day.neutral'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
      'vernalization.required': {
        expressed: ['none'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
    },
    quantitative: {
      ...DERIVED_TRAITS,
      'thermal.base_temp': 6,
      'thermal.constant': 1400,
      'photoperiod.critical': 12,
      'vernalization.hours': 100,
      'dormancy.depth': 0.35,
      ...overrides,
    },
  }
}

const DAY_NEUTRAL_LONG = 16
const DAY_NEUTRAL_SHORT = 8

describe('phenologyAt', () => {
  it('starts at germination with no accumulated warmth', () => {
    expect(phenologyAt(state(0), phenotype(), ROSEMARY, 12).stage).toBe('germination')
  })

  it('passes through juvenile, vegetative, bud and bloom as warmth accumulates', () => {
    const p = phenotype()
    const stages = [0, 200, 700, 1300, 1500].map(
      (gdd) => phenologyAt(state(gdd), p, ROSEMARY, 12).stage,
    )
    expect(stages[0]).toBe('germination')
    expect(stages[1]).toBe('juvenile')
    expect(stages[2]).toBe('vegetative')
    expect(stages[3]).toBe('bud')
    expect(stages[4]).toBe('bloom')
  })

  it('reports progress within a stage between zero and one', () => {
    for (const gdd of [0, 100, 400, 900, 1399, 2000]) {
      const progress = phenologyAt(state(gdd), phenotype(), ROSEMARY, 12).progress
      expect(progress).toBeGreaterThanOrEqual(0)
      expect(progress).toBeLessThanOrEqual(1)
    }
  })

  it('never moves backwards as warmth accumulates', () => {
    const order = ['germination', 'juvenile', 'vegetative', 'bud', 'bloom', 'seed', 'senescence', 'dormancy']
    const p = phenotype()
    let previous = -1
    for (let gdd = 0; gdd <= 4000; gdd += 50) {
      const stage = phenologyAt(state(gdd), p, ROSEMARY, 12).stage
      const index = order.indexOf(stage)
      expect(index, `at ${gdd}`).toBeGreaterThanOrEqual(previous)
      previous = index
    }
  })

  it('refuses to bloom while a long-day plant has short days', () => {
    const longDay = phenotype()
    longDay.discrete['photoperiod.response'] = {
      expressed: ['long.day'],
      winner: 2,
      blended: false,
      secondaryWeight: 0,
    }
    expect(phenologyAt(state(5000), longDay, ROSEMARY, DAY_NEUTRAL_SHORT).stage).toBe('bud')
  })

  it('allows a long-day plant to bloom on long days', () => {
    const longDay = phenotype()
    longDay.discrete['photoperiod.response'] = {
      expressed: ['long.day'],
      winner: 2,
      blended: false,
      secondaryWeight: 0,
    }
    expect(phenologyAt(state(5000), longDay, ROSEMARY, DAY_NEUTRAL_LONG).stage).toBe('bloom')
  })

  it('refuses to bloom until vernalisation is satisfied', () => {
    const needsChill = phenotype()
    needsChill.discrete['vernalization.required'] = {
      expressed: ['required'],
      winner: 1,
      blended: false,
      secondaryWeight: 0,
    }
    expect(phenologyAt(state(5000, 10), needsChill, ROSEMARY, 12).stage).toBe('bud')
    expect(phenologyAt(state(5000, 200), needsChill, ROSEMARY, 12).stage).toBe('bloom')
  })

  it('scales the thermal budget with the species, not a fixed number', () => {
    const quick: SpeciesTemplate = { ...ROSEMARY, baseline: { ...ROSEMARY.baseline, thermalConstant: 200 } }
    expect(phenologyAt(state(300), phenotype(), quick, 12).stage).toBe('bloom')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test phenology`

- [ ] **Step 3: Implement phenology.ts**

`packages/engine/src/dev/phenology.ts`:

```ts
import type { Phenotype } from '../phenotype.ts'
import type { SpeciesTemplate } from '../species.ts'
import type { ThermalState } from './thermal.ts'

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
 * `senescence` and `dormancy` are in the union because the lifecycle needs
 * them (spec §5.4), but they are **not** driven by accumulated warmth: a plant
 * does not senesce because it got hotter. They are triggered by season, which
 * is M1's job alongside growth over real time. Nothing in M0b returns them.
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
 * that has accumulated enough warmth but sees the wrong daylength or has had
 * too little chilling holds at bud rather than flowering. That gate is what
 * makes bloom time predictable and explainable, which spec §5.2 requires.
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
      // Hold at bud. The plant is ready but the season is not.
      stage = 'bud'
      start = STAGE_STARTS[3]?.[1] ?? 0.75
      end = STAGE_STARTS[4]?.[1] ?? 0.95
    }
  }

  const span = end - start
  const progress = span <= 0 ? 1 : Math.max(0, Math.min(1, (fraction - start) / span))
  return { stage, progress }
}

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test phenology && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS. The "never moves backwards" test is the one most likely to catch an off-by-one in the boundaries; fix the boundaries, not the test.

Note `STAGE_STARTS` boundaries were derived by working backwards from the tests:
a budget of 1400 must give `bloom` at 1500 accumulated, which fixes the bloom
boundary between 0.95 and 1.05. Do not move it without moving the test's
expectations with it.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/dev/phenology.ts packages/engine/test/dev/phenology.test.ts
git commit -m "feat(engine): phenology stages with photoperiod and vernalisation gates"
```

---

### Task 5: Structure types and a bare stem

**Files:**
- Create: `packages/engine/src/dev/structure.ts`
- Test: `packages/engine/test/dev/structure.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `OrganKind`, `Transform`, `Organ`, `Structure`, `countOrgans(organ)`, `flatten(organ)`, `heightOf(organ)`, `leafAreaOf(organ)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/dev/structure.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  countOrgans,
  flatten,
  heightOf,
  leafAreaOf,
  makeOrgan,
  type Organ,
} from '../../src/dev/structure.ts'

const tip: Organ = makeOrgan({ kind: 'flower', x: 0, y: 3, angle: 0, scale: 1 }, 1, 1)

describe('makeOrgan', () => {
  it('carries an identity, a transform and a size', () => {
    expect(tip.kind).toBe('flower')
    expect(tip.transform.y).toBe(3)
    expect(tip.children).toEqual([])
  })

  it('supports children', () => {
    const stem = makeOrgan({ kind: 'stem', x: 0, y: 0, angle: 0, scale: 1 }, 3, 0.2, [tip])
    expect(stem.children.length).toBe(1)
  })
})

describe('traversal', () => {
  const leafA = makeOrgan({ kind: 'leaf', x: 1, y: 1, angle: 0, scale: 1 }, 2, 1)
  const leafB = makeOrgan({ kind: 'leaf', x: -1, y: 2, angle: 90, scale: 1 }, 3, 1)
  const stem = makeOrgan({ kind: 'stem', x: 0, y: 0, angle: 0, scale: 1 }, 3, 0.2, [leafA, leafB])

  it('counts every organ including the root', () => {
    expect(countOrgans(stem)).toBe(3)
  })

  it('flattens in a stable depth-first order', () => {
    expect(flatten(stem).map((o) => o.kind)).toEqual(['stem', 'leaf', 'leaf'])
  })

  it('reports height as the highest y', () => {
    expect(heightOf(stem)).toBe(2)
  })

  it('sums leaf area over leaves only', () => {
    // two leaves of length 2 and 3, width 1: area approximated as length * width
    expect(leafAreaOf(stem)).toBeCloseTo(5, 6)
  })

  it('handles a single organ', () => {
    expect(countOrgans(tip)).toBe(1)
    expect(heightOf(tip)).toBe(3)
    expect(leafAreaOf(tip)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test structure`

- [ ] **Step 3: Implement structure.ts**

`packages/engine/src/dev/structure.ts`:

```ts
/** What an organ is. Identity comes from the ABC model (see identity.ts). */
export type OrganKind =
  | 'root'
  | 'stem'
  | 'internode'
  | 'petiole'
  | 'leaf'
  | 'thorn'
  | 'bud'
  | 'flower'
  | 'sepal'
  | 'petal'
  | 'stamen'
  | 'carpel'

export interface Transform {
  readonly x: number
  readonly y: number
  /** Degrees, anticlockwise from vertical. */
  readonly angle: number
  readonly scale: number
}

export interface Organ {
  readonly kind: OrganKind
  readonly transform: Transform
  /** Length along the organ's own axis. */
  readonly length: number
  /** Width across the organ's own axis. */
  readonly width: number
  readonly children: readonly Organ[]
}

/** A whole plant, plus the totals the allometry checks need. */
export interface Structure {
  readonly root: Organ
  readonly organCount: number
  readonly height: number
  readonly leafArea: number
  /**
   * The phenology stage name. Typed as a string rather than the `Stage` union
   * on purpose: `structure.ts` must not depend on `phenology.ts`, or the two
   * modules end up importing each other.
   */
  readonly stage: string
  /** Allometric plausibility, zero to one. See allometry.ts. */
  readonly plausibilityScore: number
}

export function makeOrgan(
  kind: OrganKind,
  transform: Transform,
  length: number,
  width: number,
  children: readonly Organ[] = [],
): Organ {
  return { kind, transform, length, width, children }
}

/** Depth-first, children in order, so the walk is deterministic. */
export function flatten(organ: Organ): readonly Organ[] {
  const out: Organ[] = [organ]
  for (const child of organ.children) out.push(...flatten(child))
  return out
}

export function countOrgans(organ: Organ): number {
  return flatten(organ).length
}

export function heightOf(organ: Organ): number {
  let max = organ.transform.y
  for (const child of organ.children) {
    const h = heightOf(child)
    if (h > max) max = h
  }
  return max
}

/**
 * Total leaf area, approximated as length times width. Enough for the pipe
 * model in allometry.ts, which only needs it to be proportional to reality.
 */
export function leafAreaOf(organ: Organ): number {
  let area = 0
  for (const o of flatten(organ)) {
    if (o.kind === 'leaf') area += o.length * o.width
  }
  return area
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test structure && pnpm --filter @ink-garden/engine typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/dev/structure.ts packages/engine/test/dev/structure.test.ts
git commit -m "feat(engine): organ, transform and structure types with traversal helpers"
```

---

### Task 6: Meristem, phytomer and phyllotaxis

The single highest-payoff task in the milestone. Get these five rules right and a plant reads as a plant even in silhouette (spec §5.1).

**Files:**
- Create: `packages/engine/src/dev/meristem.ts`
- Test: `packages/engine/test/dev/meristem.test.ts`

**Interfaces:**
- Consumes: `Organ`, `Transform` from `./structure.ts`; `rngFrom` from `../rng.ts`
- Produces: `Phyllotaxis`, `phyllotaxisAngle(pattern)`, `leavesPerNode(pattern)`, `nextBudAngle(pattern, nodeIndex)`, `growPhytomers(config)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/dev/meristem.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  GOLDEN_ANGLE,
  growPhytomers,
  leavesPerNode,
  nextBudAngle,
  phyllotaxisAngle,
} from '../../src/dev/meristem.ts'

describe('phyllotaxis', () => {
  it('uses the golden angle for a spiral', () => {
    expect(phyllotaxisAngle('spiral')).toBeCloseTo(GOLDEN_ANGLE, 6)
    expect(GOLDEN_ANGLE).toBeGreaterThan(137.5)
    expect(GOLDEN_ANGLE).toBeLessThan(137.6)
  })

  it('uses a half turn for alternate', () => {
    expect(phyllotaxisAngle('alternate')).toBeCloseTo(180, 6)
  })

  it('uses a quarter turn for decussate pairs', () => {
    expect(phyllotaxisAngle('decussate')).toBeCloseTo(90, 6)
    expect(leavesPerNode('decussate')).toBe(2)
  })

  it('uses a third of a turn for whorls of three', () => {
    expect(phyllotaxisAngle('whorled')).toBeCloseTo(120, 6)
    expect(leavesPerNode('whorled')).toBe(3)
  })

  it('gives one leaf per node except for opposite and whorled', () => {
    expect(leavesPerNode('alternate')).toBe(1)
    expect(leavesPerNode('spiral')).toBe(1)
  })
})

describe('nextBudAngle', () => {
  it('advances by the phyllotaxis angle per node', () => {
    expect(nextBudAngle('spiral', 0)).toBeCloseTo(0, 6)
    expect(nextBudAngle('spiral', 1)).toBeCloseTo(GOLDEN_ANGLE, 6)
    expect(nextBudAngle('spiral', 2)).toBeCloseTo(2 * GOLDEN_ANGLE, 6)
  })

  it('stays within zero to 360 degrees', () => {
    for (let node = 0; node < 40; node += 1) {
      const angle = nextBudAngle('spiral', node)
      expect(angle).toBeGreaterThanOrEqual(0)
      expect(angle).toBeLessThan(360)
    }
  })

  it('never repeats within a plausible node count for a spiral', () => {
    const seen = new Set<number>()
    for (let node = 0; node < 12; node += 1) {
      seen.add(Math.round(nextBudAngle('spiral', node)))
    }
    expect(seen.size).toBe(12)
  })
})

describe('growPhytomers', () => {
  const config = {
    nodes: 8,
    pattern: 'spiral' as const,
    internodeLength: 10,
    leafLength: 6,
    leafWidth: 2,
    seed: 'phyto',
  }

  it('produces one internode and one leaf per node for a spiral', () => {
    const result = growPhytomers(config)
    expect(result.internodes.length).toBe(8)
    expect(result.leaves.length).toBe(8)
  })

  it('stacks internodes end to end', () => {
    const result = growPhytomers({ ...config, internodeLength: 5 })
    const ys = result.internodes.map((o) => o.transform.y)
    expect(ys[0]).toBeCloseTo(0, 6)
    expect(ys[1]).toBeCloseTo(5, 6)
    expect(ys[7]).toBeCloseTo(35, 6)
  })

  it('is deterministic for a seed', () => {
    expect(growPhytomers(config)).toEqual(growPhytomers(config))
  })

  it('differs for a different seed, because jitter does', () => {
    expect(growPhytomers(config)).not.toEqual(growPhytomers({ ...config, seed: 'other' }))
  })

  it('spirals the leaves rather than stacking them', () => {
    const angles = growPhytomers(config).leaves.map((o) => o.transform.angle)
    expect(new Set(angles.map((a) => Math.round(a))).size).toBeGreaterThan(5)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test meristem`

- [ ] **Step 3: Implement meristem.ts**

`packages/engine/src/dev/meristem.ts`:

```ts
import { rngFrom } from '../rng.ts'
import { makeOrgan, type Organ } from './structure.ts'

export type Phyllotaxis = 'alternate' | 'decussate' | 'whorled' | 'spiral'

/** The golden angle, 360 * (1 - 1/phi). The reason plants look like plants. */
export const GOLDEN_ANGLE = 360 * (1 - 1 / ((1 + Math.sqrt(5)) / 2))

export function phyllotaxisAngle(pattern: Phyllotaxis): number {
  switch (pattern) {
    case 'alternate':
      return 180
    case 'decussate':
      return 90
    case 'whorled':
      return 120
    case 'spiral':
    default:
      return GOLDEN_ANGLE
  }
}

export function leavesPerNode(pattern: Phyllotaxis): number {
  switch (pattern) {
    case 'decussate':
      return 2
    case 'whorled':
      return 3
    default:
      return 1
  }
}

/** Angle of the first leaf at a node, measured from the previous node. */
export function nextBudAngle(pattern: Phyllotaxis, nodeIndex: number): number {
  const raw = nodeIndex * phyllotaxisAngle(pattern)
  return ((raw % 360) + 360) % 360
}

export interface PhytomerConfig {
  readonly nodes: number
  readonly pattern: Phyllotaxis
  readonly internodeLength: number
  readonly leafLength: number
  readonly leafWidth: number
  readonly seed: string
}

export interface Phytomers {
  readonly internodes: readonly Organ[]
  readonly leaves: readonly Organ[]
}

/**
 * Run a shoot apical meristem: repeatedly produce a phytomer, which is one
 * internode, one leaf, and one axillary bud, with successive leaves placed by
 * phyllotaxis (spec §5.1).
 *
 * Internode length is jittered slightly per node, seeded by the plant, because
 * perfectly regular spacing reads as artificial.
 */
export function growPhytomers(config: PhytomerConfig): Phytomers {
  const internodes: Organ[] = []
  const leaves: Organ[] = []
  const r = rngFrom(`phytomer|${config.seed}`)

  let heightSoFar = 0
  for (let node = 0; node < config.nodes; node += 1) {
    const jitter = 0.85 + r() * 0.3
    const length = config.internodeLength * jitter
    internodes.push(
      makeOrgan('internode', { x: 0, y: heightSoFar, angle: 0, scale: 1 }, length, 0.1),
    )
    heightSoFar += length

    const perNode = leavesPerNode(config.pattern)
    for (let i = 0; i < perNode; i += 1) {
      const base = nextBudAngle(config.pattern, node)
      const angle = base + (i * 360) / perNode
      const leafR = rngFrom(`leaf|${config.seed}|${node}|${i}`)
      const leafLength = config.leafLength * (0.8 + leafR() * 0.4)
      leaves.push(
        makeOrgan(
          'leaf',
          { x: 0, y: heightSoFar, angle: ((angle % 360) + 360) % 360, scale: 1 },
          leafLength,
          config.leafWidth,
        ),
      )
    }
  }

  return { internodes, leaves }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test meristem && pnpm --filter @ink-garden/engine typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/dev/meristem.ts packages/engine/src/dev/structure.ts packages/engine/test/dev/meristem.test.ts
git commit -m "feat(engine): meristem, phytomer production and phyllotaxis"
```

---

### Task 7: Apical dominance and branching

**Files:**
- Modify: `packages/engine/src/dev/meristem.ts`
- Test: `packages/engine/test/dev/meristem.test.ts` (add a suite)

**Interfaces:**
- Consumes: everything from Task 6
- Produces: `branchConfig`, `shouldBranch(dominance, nodeIndex, r)`, `buildShoot(config)`

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/test/dev/meristem.test.ts`:

```ts
import { buildShoot, shouldBranch } from '../../src/dev/meristem.ts'

describe('shouldBranch', () => {
  it('never branches under total apical dominance', () => {
    for (const r of [0, 0.5, 0.999]) {
      expect(shouldBranch(1, 5, r)).toBe(false)
    }
  })

  it('always branches with no apical dominance', () => {
    for (const r of [0, 0.5, 0.999]) {
      expect(shouldBranch(0, 5, r)).toBe(true)
    }
  })

  it('branches less as dominance rises', () => {
    const count = (dominance: number): number => {
      let n = 0
      for (let i = 0; i < 200; i += 1) {
        if (shouldBranch(dominance, 4, (i + 0.5) / 200)) n += 1
      }
      return n
    }
    expect(count(0.2)).toBeGreaterThan(count(0.6))
    expect(count(0.6)).toBeGreaterThan(count(0.9))
  })

  it('does not branch at the lowest node, which is the seed leaf', () => {
    expect(shouldBranch(0, 0, 0)).toBe(false)
  })
})

describe('buildShoot', () => {
  const config = {
    nodes: 10,
    pattern: 'spiral' as const,
    internodeLength: 8,
    leafLength: 5,
    leafWidth: 2,
    apicalDominance: 0.4,
    branchAngle: 40,
    seed: 'shoot',
  }

  it('is deterministic', () => {
    expect(buildShoot(config)).toEqual(buildShoot(config))
  })

  it('always has a main axis', () => {
    const shoot = buildShoot(config)
    expect(shoot.internodes.length).toBe(config.nodes)
  })

  it('produces branches as separate shoots when dominance is low', () => {
    const bushy = buildShoot({ ...config, apicalDominance: 0 })
    const sparse = buildShoot({ ...config, apicalDominance: 1 })
    expect(bushy.branches.length).toBeGreaterThan(sparse.branches.length)
    expect(sparse.branches.length).toBe(0)
  })

  it('branches at the configured angle', () => {
    const bushy = buildShoot({ ...config, apicalDominance: 0 })
    const first = bushy.branches[0]
    if (first === undefined) throw new Error('expected at least one branch')
    expect(Math.abs(first.angle)).toBeCloseTo(config.branchAngle, 6)
  })

  it('records the node each branch came from, so it can be placed', () => {
    const bushy = buildShoot({ ...config, apicalDominance: 0 })
    for (const branch of bushy.branches) {
      expect(branch.node).toBeGreaterThanOrEqual(1)
      expect(branch.node).toBeLessThan(config.nodes)
    }
  })

  it('keeps the total organ count bounded, so nothing explodes', () => {
    const bushy = buildShoot({ ...config, apicalDominance: 0 })
    const total = bushy.internodes.length + bushy.leaves.length + bushy.branches.length
    expect(total).toBeLessThan(config.nodes * 8)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test meristem`

- [ ] **Step 3: Extend meristem.ts**

Add to `packages/engine/src/dev/meristem.ts`:

```ts
/**
 * Whether an axillary bud grows out.
 *
 * Apical dominance is the suppression of buds by the shoot tip, which is why a
 * stem grows as one shoot rather than a bush. Modelled directly as a
 * probability of suppression rather than as a hormone, because the hormone
 * would be unobservable anyway.
 */
export function shouldBranch(
  apicalDominance: number,
  nodeIndex: number,
  r: number,
): boolean {
  if (nodeIndex === 0) return false
  return r >= apicalDominance
}

export interface ShootConfig {
  readonly nodes: number
  readonly pattern: Phyllotaxis
  readonly internodeLength: number
  readonly leafLength: number
  readonly leafWidth: number
  readonly apicalDominance: number
  readonly branchAngle: number
  readonly seed: string
}

export interface Branch {
  /** Index of the node whose axillary bud produced this branch. */
  readonly node: number
  /** Angle from the parent axis, in degrees. Negative is one side. */
  readonly angle: number
  readonly shoot: Shoot
}

export interface Shoot {
  readonly internodes: readonly Organ[]
  readonly leaves: readonly Organ[]
  readonly branches: readonly Branch[]
}

const MAX_BRANCH_DEPTH = 2

/**
 * Grow a shoot, and let some of its axillary buds become branches.
 *
 * Depth is capped so a completely undominated plant does not produce thousands
 * of organs, which is both slow and unlike any real plant.
 */
export function buildShoot(config: ShootConfig, depth = 0): Shoot {
  const phytomers = growPhytomers({
    nodes: config.nodes,
    pattern: config.pattern,
    internodeLength: config.internodeLength,
    leafLength: config.leafLength,
    leafWidth: config.leafWidth,
    seed: config.seed,
  })

  const branches: Branch[] = []
  if (depth < MAX_BRANCH_DEPTH) {
    for (let node = 1; node < config.nodes; node += 1) {
      const r = rngFrom(`branch|${config.seed}|${depth}|${node}`)()
      if (!shouldBranch(config.apicalDominance, node, r)) continue
      const side = rngFrom(`side|${config.seed}|${node}`)() < 0.5 ? -1 : 1
      branches.push({
        node,
        angle: side * config.branchAngle,
        shoot: buildShoot(
          {
            ...config,
            nodes: Math.max(2, Math.round(config.nodes * 0.6)),
            apicalDominance: Math.min(1, config.apicalDominance + 0.15),
            seed: `${config.seed}|b${depth}|${node}`,
          },
          depth + 1,
        ),
      })
    }
  }

  return { internodes: phytomers.internodes, leaves: phytomers.leaves, branches }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test meristem && pnpm --filter @ink-garden/engine typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/dev/meristem.ts packages/engine/test/dev/meristem.test.ts
git commit -m "feat(engine): apical dominance and branching"
```

---

### Task 8: Organ identity, the ABC model

**Files:**
- Create: `packages/engine/src/dev/identity.ts`
- Test: `packages/engine/test/dev/identity.test.ts`

**Interfaces:**
- Consumes: `Phenotype` from `../phenotype.ts`; `OrganKind` from `./structure.ts`
- Produces: `whorlIdentity(whorl, phenotype)`, `flowerOrgans(phenotype, petalLength, petalWidth, seed)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/dev/identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { flowerOrgans, whorlIdentity } from '../../src/dev/identity.ts'
import { DERIVED_TRAITS, type MutablePhenotype } from '../../src/phenotype.ts'

function phenotype(
  discreets: Partial<Record<string, string>> = {},
  quantitative: Partial<Record<string, number>> = {},
): MutablePhenotype {
  const base: MutablePhenotype = {
    discrete: {},
    quantitative: {
      ...DERIVED_TRAITS,
      'petal.count': 5,
      'petal.length': 1,
      'petal.width': 1,
    },
  }
  for (const [id, name] of Object.entries(discreets)) {
    base.discrete[id] = { expressed: [name], winner: 1, blended: false, secondaryWeight: 0 }
  }
  for (const [id, value] of Object.entries(quantitative)) {
    base.quantitative[id] = value
  }
  return base
}

describe('whorlIdentity', () => {
  it('follows the ABC model for a normal flower', () => {
    const p = phenotype({ 'flower.organ.identity': 'normal', 'flower.doubling': 'single' })
    expect(whorlIdentity(1, p)).toBe('sepal')
    expect(whorlIdentity(2, p)).toBe('petal')
    expect(whorlIdentity(3, p)).toBe('stamen')
    expect(whorlIdentity(4, p)).toBe('carpel')
  })

  it('turns the first whorl into petals when sepals are petaloid', () => {
    const p = phenotype({
      'flower.organ.identity': 'sepals.petaloid',
      'flower.doubling': 'single',
    })
    expect(whorlIdentity(1, p)).toBe('petal')
    expect(whorlIdentity(2, p)).toBe('petal')
  })

  it('turns the third whorl into petals when the flower is double', () => {
    const p = phenotype({ 'flower.organ.identity': 'normal', 'flower.doubling': 'double' })
    expect(whorlIdentity(3, p)).toBe('petal')
    expect(whorlIdentity(4, p)).toBe('carpel')
  })

  it('rejects a whorl outside one to four', () => {
    const p = phenotype()
    expect(() => whorlIdentity(0, p)).toThrow()
    expect(() => whorlIdentity(5, p)).toThrow()
  })
})

describe('flowerOrgans', () => {
  it('produces organs for every whorl', () => {
    const organs = flowerOrgans(phenotype(), 2, 1, 'flower')
    expect(organs.length).toBeGreaterThan(0)
    expect(organs.some((o) => o.kind === 'petal')).toBe(true)
    expect(organs.some((o) => o.kind === 'stamen')).toBe(true)
    expect(organs.some((o) => o.kind === 'carpel')).toBe(true)
  })

  it('places petals in whorls two and three for a double flower', () => {
    const single = flowerOrgans(phenotype({ 'flower.doubling': 'single' }), 2, 1, 'f')
    const double = flowerOrgans(phenotype({ 'flower.doubling': 'double' }), 2, 1, 'f')
    const count = (kind: string, list: readonly { kind: string }[]): number =>
      list.filter((o) => o.kind === kind).length
    expect(count('petal', double)).toBeGreaterThan(count('petal', single))
    expect(count('stamen', double)).toBe(0)
  })

  it('distributes the phenotype petal count across the petaloid whorls', () => {
    const organs = flowerOrgans(phenotype(undefined, { 'petal.count': 6 }), 2, 1, 'f')
    expect(organs.filter((o) => o.kind === 'petal').length).toBe(6)
  })

  it('is deterministic', () => {
    expect(flowerOrgans(phenotype(), 2, 1, 'seed')).toEqual(
      flowerOrgans(phenotype(), 2, 1, 'seed'),
    )
  })

  it('arranges organs radially in each whorl', () => {
    const organs = flowerOrgans(phenotype(undefined, { 'petal.count': 6 }), 2, 1, 'f')
    const angles = organs.filter((o) => o.kind === 'petal').map((o) => o.transform.angle)
    expect(new Set(angles.map((a) => Math.round(a))).size).toBe(6)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test identity`

- [ ] **Step 3: Implement identity.ts**

`packages/engine/src/dev/identity.ts`:

```ts
import type { Phenotype } from '../phenotype.ts'
import { rngFrom } from '../rng.ts'
import { makeOrgan, type Organ, type OrganKind } from './structure.ts'

/**
 * The ABC model, which is the whole reason the genome is a hierarchy.
 *
 * Four concentric whorls, and three classes of gene active in overlapping
 * zones. The combination present decides what each whorl becomes:
 *
 *   whorl 1  A      -> sepal
 *   whorl 2  A + B  -> petal
 *   whorl 3  B + C  -> stamen
 *   whorl 4  C      -> carpel
 *
 * A and C repress each other, which is what keeps the zones sharp. Two
 * homeotic mutations are modelled by overriding a whorl's fate: petaloid sepals
 * (class A extended) and doubling (class C lost, so whorl 3 becomes petals).
 */
export function whorlIdentity(whorl: number, phenotype: Phenotype): OrganKind {
  if (whorl < 1 || whorl > 4) throw new Error(`Whorl ${whorl} is outside 1 to 4`)

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
  return [1, 2, 3, 4].filter((w) => whorlIdentity(w, phenotype) === 'petal')
}

/** Radial placement of `count` organs in a whorl of `radius`. */
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
    const angle = phase + (i * 360) / Math.max(1, count)
    organs.push(
      makeOrgan(
        kind,
        { x: Math.cos((angle * Math.PI) / 180) * radius, y: 0, angle, scale: 1 },
        length,
        width,
      ),
    )
  }
  return organs
}

/**
 * Build a flower: one ring of organs per whorl, with the phenotype's total
 * petal count distributed across whichever whorls turned petaloid, so doubling
 * adds petals rather than replacing them with a different number.
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

  const organs: Organ[] = []
  // A per-plant phase offset, so two flowers of the same species are not
  // rotationally identical.
  let phase = rngFrom(`flower|${seed}`)() * 137.5
  for (const whorl of [1, 2, 3, 4]) {
    const kind = whorlIdentity(whorl, phenotype)
    const radius = 0.2 + whorl * 0.15
    const count =
      kind === 'petal'
        ? Math.max(1, Math.round(perPetalWhorl))
        : kind === 'sepal'
          ? Math.max(1, Math.round(petals * 0.6))
          : kind === 'stamen'
            ? Math.max(1, Math.round(petals * 1.6))
            : 1
    const length = kind === 'petal' ? petalLength : kind === 'sepal' ? petalLength * 0.5 : 0.3
    const width = kind === 'petal' ? petalWidth : petalWidth * 0.5
    organs.push(...whorlOrgans(kind, count, radius, length, width, phase))
    phase += 137.5
  }
  return organs
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test identity && pnpm --filter @ink-garden/engine typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/dev/identity.ts packages/engine/test/dev/identity.test.ts
git commit -m "feat(engine): ABC organ identity, petaloid sepals and doubling"
```

---

### Task 9: Allometry

The unsung realism win. Real plants obey these whether they want to or not, and without them a genome can build a rose with sunflower petals on a grass stem (spec §4.9).

**Files:**
- Create: `packages/engine/src/dev/allometry.ts`
- Test: `packages/engine/test/dev/allometry.test.ts`

**Interfaces:**
- Consumes: `Structure`, `leafAreaOf`, `heightOf` from `./structure.ts`
- Produces: `pipeModelStemRadius(leafArea)`, `maxHeightForRadius(radius)`, `enforceAllometry(structure)`, `plausibility(structure)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/dev/allometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  enforceAllometry,
  maxHeightForRadius,
  pipeModelStemRadius,
  plausibility,
} from '../../src/dev/allometry.ts'
import { leafAreaOf, makeOrgan, type Organ } from '../../src/dev/structure.ts'

const leaf = (x: number, y: number, length: number, width: number): Organ =>
  makeOrgan('leaf', { x, y, angle: 0, scale: 1 }, length, width)

describe('pipeModelStemRadius', () => {
  it('is zero for no leaves', () => {
    expect(pipeModelStemRadius(0)).toBe(0)
  })

  it('grows with the square root of leaf area', () => {
    // Four times the leaf area needs twice the radius.
    const one = pipeModelStemRadius(10)
    const four = pipeModelStemRadius(40)
    expect(four / one).toBeCloseTo(2, 6)
  })

  it('is monotonic', () => {
    let previous = -1
    for (const area of [0, 1, 5, 20, 100]) {
      const radius = pipeModelStemRadius(area)
      expect(radius).toBeGreaterThan(previous)
      previous = radius
    }
  })
})

describe('maxHeightForRadius', () => {
  it('is larger for a thicker stem', () => {
    expect(maxHeightForRadius(2)).toBeGreaterThan(maxHeightForRadius(1))
  })

  it('grows sublinearly, so height has diminishing returns', () => {
    const double = maxHeightForRadius(2) / maxHeightForRadius(1)
    expect(double).toBeGreaterThan(1.3)
    expect(double).toBeLessThan(2)
  })
})

describe('enforceAllometry', () => {
  it('thickens a stem that is too thin for its leaves', () => {
    const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 10, 0.01, [
      leaf(0, 2, 20, 10),
      leaf(0, 4, 20, 10),
      leaf(0, 6, 20, 10),
    ])
    const fixed = enforceAllometry(stem, 1)
    expect(fixed.width).toBeGreaterThan(stem.width)
  })

  it('leaves a stem alone when it is already thick enough', () => {
    const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 10, 50, [
      leaf(0, 2, 1, 1),
    ])
    const fixed = enforceAllometry(stem, 1)
    expect(fixed.width).toBeCloseTo(50, 6)
  })

  it('thickens rather than shortening, because nothing may be lost', () => {
    const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 100, 0.5, [
      leaf(0, 2, 5, 5),
    ])
    const fixed = enforceAllometry(stem, 1)
    expect(fixed.length).toBeCloseTo(100, 6)
  })

  it('never removes an organ', () => {
    const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 10, 0.01, [
      leaf(0, 2, 20, 10),
    ])
    const count = (o: Organ): number =>
      1 + o.children.reduce((sum, child) => sum + count(child), 0)
    expect(count(enforceAllometry(stem, 1))).toBe(count(stem))
  })

  it('is idempotent', () => {
    const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 10, 0.01, [
      leaf(0, 2, 20, 10),
    ])
    const once = enforceAllometry(stem, 1)
    expect(enforceAllometry(once, 1)).toEqual(once)
  })

  it('is deterministic', () => {
    const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 10, 0.01, [
      leaf(0, 2, 20, 10),
    ])
    expect(enforceAllometry(stem, 1)).toEqual(enforceAllometry(stem, 1))
  })
})

describe('plausibility', () => {
  it('scores a well proportioned plant highly', () => {
    const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 10, 10, [
      leaf(0, 2, 3, 2),
    ])
    expect(plausibility(stem)).toBeGreaterThan(0.6)
  })

  it('scores a grass stem carrying sunflower leaves poorly', () => {
    const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 200, 0.05, [
      leaf(0, 2, 40, 40),
      leaf(0, 4, 40, 40),
    ])
    expect(plausibility(stem)).toBeLessThan(0.4)
  })

  it('returns a number between zero and one', () => {
    for (const width of [0.01, 0.1, 1, 10, 100]) {
      const stem = makeOrgan('stem', { x: 0, y: 0, angle: 0, scale: 1 }, 20, width, [
        leaf(0, 2, 5, 5),
      ])
      const score = plausibility(stem)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test allometry`

- [ ] **Step 3: Implement allometry.ts**

`packages/engine/src/dev/allometry.ts`:

```ts
import { heightOf, leafAreaOf, makeOrgan, type Organ } from './structure.ts'

/**
 * Pipe model theory: leaf area is served by sapwood cross-section, so the two
 * are proportional. Shinozaki et al. 1964; still the standard allometric
 * relation for leaf mass and stem area.
 */
const PIPE_CONSTANT = 0.35

/** Radius required to supply a given leaf area, from the pipe model. */
export function pipeModelStemRadius(leafArea: number): number {
  if (leafArea <= 0) return 0
  return Math.sqrt(leafArea / (PIPE_CONSTANT * Math.PI))
}

/**
 * Critical buckling height, from Greenhill's formula for a column failing under
 * its own weight. Maximum height scales as the two-thirds power of diameter,
 * which is why height has diminishing returns and why a thin stem cannot be
 * tall. The constant is a fudge for terrestrial wood; the exponent is the real
 * content.
 */
const BUCKLING_CONSTANT = 12

export function maxHeightForRadius(radius: number): number {
  if (radius <= 0) return 0
  return BUCKLING_CONSTANT * Math.pow(radius * 2, 2 / 3)
}

/**
 * Make a plant physically plausible, by thickening and never by removing.
 *
 * The rules are firm about this: nothing may be lost, and a constraint is not a
 * punishment (spec §2). So a stem that is too thin for its leaves gets thicker,
 * and a stem too thin for its height also gets thicker. Height is never
 * reduced, because reducing it would be losing something the user grew.
 */
export function enforceAllometry(organ: Organ, stemAreaRatio: number): Organ {
  const leafArea = leafAreaOf(organ)
  const pipeRadius = pipeModelStemRadius(leafArea)
  const required = Math.max(pipeRadius, organ.width * stemAreaRatio)

  const height = heightOf(organ)
  let width = Math.max(organ.width, required)
  // Thicken until the buckling limit is satisfied. Two passes always suffice
  // because maxHeight grows as the two-thirds power of radius.
  for (let i = 0; i < 4 && height > maxHeightForRadius(width / 2); i += 1) {
    width *= 1.5
  }

  const scaled = organ.kind === 'stem' || organ.kind === 'internode' ? width : organ.width
  const children = organ.children.map((child) => enforceAllometry(child, stemAreaRatio))
  return makeOrgan(organ.kind, organ.transform, organ.length, scaled, children)
}

/**
 * How plausible an organ tree is, zero to one. Used by the art gate to refuse
 * to present nonsense rather than showing it (spec §4.9).
 */
export function plausibility(organ: Organ): number {
  const leafArea = leafAreaOf(organ)
  const height = heightOf(organ)
  const radius = organ.width / 2

  if (leafArea === 0 && height === 0) return 1

  const pipe = pipeModelStemRadius(leafArea)
  const pipeScore =
    pipe <= 0 ? 1 : Math.min(1, Math.max(0, 1 - Math.abs(pipe - radius) / Math.max(pipe, radius)))

  const limit = maxHeightForRadius(radius)
  const bucklingScore =
    limit <= 0 ? 0 : Math.min(1, Math.max(0, Math.min(1, limit / Math.max(0.001, height))))

  return Math.max(0, Math.min(1, 0.5 * pipeScore + 0.5 * bucklingScore))
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test allometry && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS. If `plausibility` does not separate the two cases in the test, the weighting or a constant is wrong; the separation is the point of the function.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/dev/allometry.ts packages/engine/test/dev/allometry.test.ts
git commit -m "feat(engine): allometry, pipe model and critical buckling height"
```

---

### Task 10: Integration — `develop`

**Files:**
- Create: `packages/engine/src/dev/develop.ts`
- Create: `packages/engine/src/dev/index.ts`
- Test: `packages/engine/test/dev/develop.test.ts`

**Interfaces:**
- Consumes: everything above, plus `expressPlant` from `../phenotype.ts`
- Produces: `develop(input): Structure`, `developOver(input): readonly Structure[]`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/dev/develop.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { develop } from '../../src/dev/develop.ts'
import { DANDELION, JACARANDA, ROSEMARY } from '../../src/species.ts'
import { founderGenome } from '../../src/genome.ts'

const base = {
  latitudeDeg: 55.86,
  startDayOfYear: 100,
}

describe('develop', () => {
  it('is deterministic', () => {
    const genome = founderGenome(ROSEMARY, 'Nia')
    const a = develop({ ...base, genome, species: ROSEMARY, days: 60 })
    const b = develop({ ...base, genome, species: ROSEMARY, days: 60 })
    expect(a).toEqual(b)
  })

  it('grows more organs over more days', () => {
    const genome = founderGenome(DANDELION, 'Nia')
    const short = develop({ ...base, genome, species: DANDELION, days: 10 })
    const long = develop({ ...base, genome, species: DANDELION, days: 80 })
    expect(long.organCount).toBeGreaterThan(short.organCount)
  })

  it('is taller over more days, up to the point it stops', () => {
    const genome = founderGenome(DANDELION, 'Nia')
    const short = develop({ ...base, genome, species: DANDELION, days: 10 })
    const long = develop({ ...base, genome, species: DANDELION, days: 60 })
    expect(long.height).toBeGreaterThan(short.height)
  })

  it('reports the phenology stage it reached', () => {
    const genome = founderGenome(DANDELION, 'Nia')
    const young = develop({ ...base, genome, species: DANDELION, days: 3 })
    const old = develop({ ...base, genome, species: DANDELION, days: 200 })
    expect(young.stage).not.toBe(old.stage)
  })

  it('gives a jacaranda more height than a dandelion from the same genome', () => {
    const genome = founderGenome(JACARANDA, 'Nia')
    const jac = develop({ ...base, genome, species: JACARANDA, days: 120 })
    const dan = develop({ ...base, genome, species: DANDELION, days: 120 })
    expect(jac.height).toBeGreaterThan(dan.height)
  })

  it('produces leaves and a flower when it gets there', () => {
    const genome = founderGenome(DANDELION, 'Nia')
    const plant = develop({ ...base, genome, species: DANDELION, days: 200 })
    const kinds = new Set<string>()
    const walk = (o: { kind: string; children: readonly unknown[] }): void => {
      kinds.add(o.kind)
      for (const c of o.children) walk(c as { kind: string; children: readonly unknown[] })
    }
    walk(plant.root)
    expect(kinds.has('leaf')).toBe(true)
    expect(kinds.has('internode')).toBe(true)
  })

  it('reports a bounded plausibility, and grows plausible plants', () => {
    for (const species of [ROSEMARY, DANDELION, JACARANDA]) {
      for (let i = 0; i < 5; i += 1) {
        const genome = founderGenome(species, `plaus-${i}`)
        const plant = develop({ ...base, genome, species, days: 150 })
        expect(plant.organCount).toBeGreaterThan(0)
        expect(Number.isFinite(plant.height)).toBe(true)
      }
    }
  })

  it('handles zero days without exploding or returning nonsense', () => {
    const genome = founderGenome(ROSEMARY, 'Nia')
    const plant = develop({ ...base, genome, species: ROSEMARY, days: 0 })
    expect(plant.organCount).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(plant.height)).toBe(true)
  })

  it('works in the southern hemisphere', () => {
    const genome = founderGenome(ROSEMARY, 'Nia')
    const north = develop({ ...base, genome, species: ROSEMARY, days: 120 })
    const south = develop({ ...base, latitudeDeg: -33.9, genome, species: ROSEMARY, days: 120 })
    expect(Number.isFinite(south.height)).toBe(true)
    expect(south.stage).toBeDefined()
    expect(north.stage).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test develop`

- [ ] **Step 3: Implement develop.ts**

`packages/engine/src/dev/develop.ts`:

```ts
import { expressPlant } from '../phenotype.ts'
import type { Genome } from '../genome.ts'
import type { SpeciesTemplate } from '../species.ts'
import { enforceAllometry, plausibility } from './allometry.ts'
import { flowerOrgans } from './identity.ts'
import { buildShoot, type Shoot } from './meristem.ts'
import { phenologyAt } from './phenology.ts'
import { accumulateThermal } from './thermal.ts'
import { dayLengthHours } from './solar.ts'
import { makeOrgan, countOrgans, heightOf, leafAreaOf, type Organ, type Structure } from './structure.ts'
import { weatherSeries } from './weather.ts'

/**
 * Flatten a shoot and its branches into organs.
 *
 * A branch starts at the height of the node whose bud produced it and steps
 * sideways along its own angle. This is deliberately approximate: properly
 * composed parent-child transforms belong with the renderer in M0c, and
 * transform composition is precisely what a renderer implements. The branching
 * *pattern* here is real; the placement is honest scaffolding.
 */
function collectShoot(
  shoot: Shoot,
  originX: number,
  originY: number,
  baseAngle: number,
  out: { internodes: Organ[]; leaves: Organ[] },
): void {
  let y = originY
  const nodeY: number[] = []
  for (const internode of shoot.internodes) {
    nodeY.push(y)
    out.internodes.push(
      makeOrgan(
        'internode',
        { x: originX, y, angle: baseAngle, scale: 1 },
        internode.length,
        internode.width,
      ),
    )
    y += internode.length
  }

  for (const leaf of shoot.leaves) {
    out.leaves.push(
      makeOrgan(
        'leaf',
        {
          x: originX,
          y: originY + leaf.transform.y,
          angle: baseAngle + leaf.transform.angle,
          scale: 1,
        },
        leaf.length,
        leaf.width,
      ),
    )
  }

  for (const branch of shoot.branches) {
    const radians = (branch.angle * Math.PI) / 180
    collectShoot(
      branch.shoot,
      originX + Math.sin(radians),
      nodeY[branch.node] ?? originY,
      baseAngle + branch.angle,
      out,
    )
  }
}

export interface DevelopInput {
  readonly genome: Genome
  readonly species: SpeciesTemplate
  readonly latitudeDeg: number
  readonly days: number
  readonly startDayOfYear?: number
}

/** Nodes a shoot produces, from stature: a tree builds a bigger axis. */
function nodesFor(stature: number): number {
  return Math.max(3, Math.min(40, Math.round(3 + stature * 0.9)))
}

/**
 * Grow a plant: weather to thermal time, thermal time to phenology, phenology
 * to how much shoot exists, and allometry to make it physically plausible.
 *
 * Nothing here draws and nothing here is time-dependent in the wall-clock
 * sense: the whole structure is a pure function of the inputs, which is what
 * lets two devices agree without syncing anything (spec §12).
 */
export function develop(input: DevelopInput): Structure {
  const start = input.startDayOfYear ?? 1
  const series = weatherSeries(Math.max(0, input.days), input.latitudeDeg, start)
  const phenotype = expressPlant(input.genome, input.species)

  const base = phenotype.quantitative['thermal.base_temp'] ?? input.species.baseline.thermalBase
  const constant = phenotype.quantitative['thermal.constant'] ?? input.species.baseline.thermalConstant
  const thermal = accumulateThermal(series, base, base + 30)

  const lastDay = series[series.length - 1]?.dayOfYear ?? start
  const dayLength = dayLengthHours(lastDay, input.latitudeDeg)
  const phenology = phenologyAt(thermal, phenotype, input.species, dayLength)

  // How much shoot exists: none before the juvenile stage, a full axis by bud.
  const fraction = constant <= 0 ? 1 : Math.min(1, thermal.accumulated / constant)
  const nodes = phenology.stage === 'germination' ? 0 : Math.max(1, Math.round(nodesFor(input.species.baseline.stature) * Math.min(1, fraction / 0.75)))

  const shoot = buildShoot({
    nodes: Math.max(0, nodes),
    pattern: input.species.id === 'spearmint' ? 'decussate' : 'spiral',
    internodeLength: (phenotype.quantitative['internode.length'] ?? 1) * 2,
    leafLength: phenotype.quantitative['leaf.length'] ?? 1,
    leafWidth: phenotype.quantitative['leaf.width'] ?? 0.5,
    apicalDominance: phenotype.quantitative['branch.apical_dominance'] ?? 0.5,
    branchAngle: phenotype.quantitative['branch.angle'] ?? 40,
    seed: `${input.genome.version}|${input.species.id}|${thermal.days}`,
  })

  // Assemble a tree. The root is a stub; internodes chain upward; leaves hang
  // off their node; branches start where their bud sat; and the flower, once
  // there is one, carries the whorls that organ identity decided on.
  const collected = { internodes: [] as Organ[], leaves: [] as Organ[] }
  collectShoot(shoot, 0, 0, 0, collected)
  const tipY = collected.internodes.reduce((sum, o) => sum + o.length, 0)

  const flowerHead =
    phenology.stage === 'bloom'
      ? [
          makeOrgan(
            'flower',
            { x: 0, y: tipY, angle: 0, scale: 1 },
            0.5,
            0.5,
            flowerOrgans(
              phenotype,
              phenotype.quantitative['petal.length'] ?? 0.5,
              phenotype.quantitative['petal.width'] ?? 0.2,
              `${input.species.id}|${input.days}`,
            ),
          ),
        ]
      : []

  const root = makeOrgan('root', { x: 0, y: 0, angle: 0, scale: 1 }, 0, 0, [
    ...collected.internodes,
    ...collected.leaves,
    ...flowerHead,
  ])

  const constrained = enforceAllometry(root, input.species.baseline.stemThickness)
  const score = plausibility(constrained)

  return {
    root: constrained,
    organCount: countOrgans(constrained),
    height: heightOf(constrained),
    leafArea: leafAreaOf(constrained),
    stage: phenology.stage,
    plausibilityScore: score,
  }
}
```

- [ ] **Step 4: Create the dev barrel**

`packages/engine/src/dev/index.ts`:

```ts
export { dayLengthHours, solarAltitudeDeg, solarDeclinationDeg, sunTimes } from './solar.ts'
export { seasonalDay, weatherSeries, type WeatherDay } from './weather.ts'
export { accumulateThermal, chillingHours, dayReachingTarget, degreeDays, type ThermalState } from './thermal.ts'
export { phenologyAt, type Phenology, type Stage } from './phenology.ts'
export { countOrgans, flatten, heightOf, leafAreaOf, makeOrgan, type Organ, type OrganKind, type Structure, type Transform } from './structure.ts'
export { GOLDEN_ANGLE, buildShoot, growPhytomers, leavesPerNode, nextBudAngle, phyllotaxisAngle, shouldBranch, type Branch, type Phyllotaxis, type Shoot, type ShootConfig } from './meristem.ts'
export { flowerOrgans, petaloidWhorls, whorlIdentity } from './identity.ts'
export { enforceAllometry, maxHeightForRadius, pipeModelStemRadius, plausibility } from './allometry.ts'
export { develop, type DevelopInput } from './develop.ts'
```

Add the same exports to `packages/engine/src/index.ts` so the dev area is part
of the public API.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm --filter @ink-garden/engine test && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/dev packages/engine/src/index.ts packages/engine/test/dev/develop.test.ts
git commit -m "feat(engine): develop, integrating weather, thermal time, phenology, meristem and allometry"
```

---

### Task 11: The structure CLI

The deliverable of M0b: something you can look at, in numbers, before M0c draws it.

**Files:**
- Create: `packages/engine/src/cli/structure.ts`
- Modify: `packages/engine/package.json` (add a `structure` script)
- Modify: `packages/engine/README.md`
- Test: `packages/engine/test/cli.test.ts` (add a suite)

**Interfaces:**
- Consumes: `develop` from the dev barrel; `SPECIES`, `founderGenome`
- Produces: a CLI printing a per-species structure summary at several ages

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/test/cli.test.ts`:

```ts
describe('structure CLI', () => {
  it('reports organ counts and height at several ages', () => {
    const out = run('structure', ['--species', 'dandelion', '--ages', '10,60,200', '--json'])
    const parsed = JSON.parse(out) as {
      species: string
      samples: readonly {
        days: number
        stage: string
        organCount: number
        height: number
        leafArea: number
        plausibility: number
      }[]
    }
    expect(parsed.species).toBe('dandelion')
    expect(parsed.samples.length).toBe(3)
    for (const sample of parsed.samples) {
      expect(sample.organCount).toBeGreaterThan(0)
      expect(Number.isFinite(sample.height)).toBe(true)
      expect(sample.plausibility).toBeGreaterThanOrEqual(0)
      expect(sample.plausibility).toBeLessThanOrEqual(1)
    }
  })

  it('grows monotonically in organ count across ages', () => {
    const out = run('structure', ['--species', 'rosemary', '--ages', '10,50,150', '--json'])
    const parsed = JSON.parse(out) as {
      samples: readonly { organCount: number }[]
    }
    const counts = parsed.samples.map((s) => s.organCount)
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1] ?? 0)
    }
  })

  it('is deterministic across runs', () => {
    const a = run('structure', ['--species', 'jacaranda', '--ages', '30,120', '--json'])
    const b = run('structure', ['--species', 'jacaranda', '--ages', '30,120', '--json'])
    expect(a).toBe(b)
  })

  it('rejects an unknown species', () => {
    expect(() => run('structure', ['--species', 'nope'])).toThrow()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test cli`

- [ ] **Step 3: Implement the CLI**

`packages/engine/src/cli/structure.ts`:

```ts
import { SPECIES, founderGenome, develop, type SpeciesTemplate } from '../index.ts'

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === undefined || !token.startsWith('--')) continue
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      args[token.slice(2)] = next
      i += 1
    } else {
      args[token.slice(2)] = 'true'
    }
  }
  return args
}

function findSpecies(id: string): SpeciesTemplate {
  const found = SPECIES.find((s) => s.id === id)
  if (found === undefined) {
    throw new Error(`Unknown species "${id}". Known: ${SPECIES.map((s) => s.id).join(', ')}`)
  }
  return found
}

const args = parseArgs(process.argv.slice(2))
const species = findSpecies(args['species'] ?? 'rosemary')
const ages = (args['ages'] ?? '10,40,80,150,300')
  .split(',')
  .map((n) => Number.parseInt(n.trim(), 10))
  .filter((n) => Number.isFinite(n) && n >= 0)
const latitude = Number.parseFloat(args['latitude'] ?? '55.86')
const asJson = args['json'] === 'true'

const samples = ages.map((days) => {
  const genome = founderGenome(species, `${species.id}-structure-${days}`)
  const plant = develop({ genome, species, latitudeDeg: latitude, days })
  return {
    days,
    stage: plant.stage,
    organCount: plant.organCount,
    height: Number(plant.height.toFixed(3)),
    leafArea: Number(plant.leafArea.toFixed(3)),
    plausibility: Number(plant.plausibilityScore.toFixed(3)),
  }
})

if (asJson) {
  process.stdout.write(`${JSON.stringify({ species: species.id, latitude, samples }, null, 2)}\n`)
} else {
  const lines = [`${species.commonName} at latitude ${latitude}`, '']
  lines.push('days   stage         organs   height   leafArea   plausibility')
  for (const s of samples) {
    lines.push(
      `${String(s.days).padStart(4)}   ${s.stage.padEnd(12)}  ` +
        `${String(s.organCount).padStart(5)}   ${s.height.toFixed(2).padStart(6)}   ` +
        `${s.leafArea.toFixed(2).padStart(8)}   ${s.plausibility.toFixed(2).padStart(12)}`,
    )
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}
```

- [ ] **Step 4: Run it by hand and read the numbers**

```bash
cd packages/engine
node src/cli/structure.ts --species dandelion --ages 10,30,60,120,200
node src/cli/structure.ts --species rosemary --ages 30,120,400,1400
node src/cli/structure.ts --species jacaranda --ages 100,1000,5000,18000
node src/cli/structure.ts --species spearmint --ages 20,90,400
```

Read these as a human. Look for: organ counts that only increase; a dandelion that reaches bloom in tens of days and a jacaranda that does not in thousands; plausibility scores that stay away from zero; and nothing absurd like 100,000 organs. **This is the last chance to catch a simulation bug with cheap numbers instead of in the renderer.**

- [ ] **Step 5: Verify cross-runtime determinism**

```bash
cd packages/engine
node src/cli/structure.ts --species jacaranda --ages 30,300 --json > /tmp/s-node.json
bun  src/cli/structure.ts --species jacaranda --ages 30,300 --json > /tmp/s-bun.json
diff /tmp/s-node.json /tmp/s-bun.json && echo "IDENTICAL V8 vs JSC"
```

Expected: IDENTICAL. Geometry uses trigonometry and may diverge in the last bits, but `Structure` holds full-precision numbers, so this will catch it if it does. **If the files differ, stop.** It means the same plant is different on her iPad, and that is a correctness bug, not a rounding nicety. The fix is to quantise in `develop`'s output, which M0c would otherwise do later.

- [ ] **Step 6: Update the package scripts and README**

Add to `packages/engine/package.json` scripts:

```json
"structure": "node src/cli/structure.ts"
```

Add to `packages/engine/README.md`, under Commands:

```markdown
pnpm structure --species jacaranda --ages 100,1000,5000
```

and a new section:

```markdown
## Development (M0b)

`develop({ genome, species, latitudeDeg, days })` returns a `Structure`: a tree
of organs with positions, angles and sizes. It is a pure function of its inputs,
so two devices compute the same plant without syncing anything.

The pipeline is weather -> thermal time -> phenology -> meristem -> allometry.
Weather comes from the seasonal estimator, which is the offline fallback from
spec §7.7 and is replaced wholesale by real Open-Meteo data at M5.

Nothing here draws. Rendering is M0c.
```

- [ ] **Step 7: Run everything**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, all suites.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/cli/structure.ts packages/engine/package.json packages/engine/README.md packages/engine/test/cli.test.ts
git commit -m "feat(engine): structure CLI; M0b complete

A genotype now becomes a plant structure: weather to thermal time, thermal
time to phenology, phenology to a meristem building phytomers, and allometry
keeping it plausible. Structure only; M0c draws it."
```

---

## Notes for whoever writes M0c

1. **Quantisation belongs at the top of M0c**, at the `Structure` boundary, if Task 11's cross-runtime check shows any divergence. The spec places it at phenotype→structure (§16), which is `develop`'s output.
2. **`Structure` carries full precision.** Do not quantise inside `develop` unless the cross-runtime check demands it, because quantising the simulation would accumulate error over days.
3. **The flower in `develop` is thin.** `flowerOrgans` produces the whorls but `develop` only attaches them at the tip. Arranging a whole inflorescence, which is what `inflorescence.type` describes, is M0c work and is the first place the discrete loci earn their keep visually.
4. **Phyllotaxis is already right.** Spiral, decussate, whorled and alternate all place organs correctly, so a spearmint (`decussate`) will already read differently from a rosemary (`spiral`) in silhouette. That is worth checking before writing any geometry.
5. **`plausibility` is the validity check the spec asks for** (§4.9). M0c should surface it rather than silently refusing, so an odd plant is explained rather than hidden.
6. **Branch placement is scaffolding.** `collectShoot` offsets a branch along its angle rather than composing transforms through the parent chain. Replacing it with real composed transforms is M0c's first task, and it is the same machinery the renderer needs anyway. Do not build a second placement path.

## Self-Review

**Spec coverage.** §5.1 meristem and phytomer: Task 6. §5.1 phyllotaxis at the golden angle: Task 6. §5.1 apical dominance: Task 7. §5.1 ABC organ identity: Task 8. §5.2 thermal time: Task 3. §5.2 the four gates, and that bloom is explained rather than hidden: Task 4. §5.3 lifecycles: Task 4's stages, though annual and biennial are not yet exercised by any species (recorded in spec §5.3 and open question 15). §5.5 memoisation by tick: **not implemented.** It is an optimisation, `develop` is cheap, and adding a cache now would be speculative; it belongs where a profiler says it does. §7 solar: Task 1. §7.3 photoperiod: Tasks 1 and 4. §7.3 vernalisation: Tasks 3 and 4. §7.7 the seasonal fallback: Task 2. §4.9 allometry priors: Task 9. §4.10 species baselines: consumed by Tasks 3, 4, 8 and 10.

**Gaps acknowledged.** Inflorescence arrangement is deferred to M0c, noted above. Thorns are in the catalogue but are not yet grown by any organ builder; they belong with M0c's geometry, since a thorn is a shape before it is a structure. Roots exist as an `OrganKind` but nothing grows them.

**Placeholder scan.** No TBD, and no "clean this up later" annotations. An earlier
draft contained five code sketches annotated with instructions to fix them while
implementing, which is worse than writing them correctly: it hands the
implementer knowingly wrong code and a judgement call. All five are now correct
in the plan. The phenology boundaries were also derived backwards from the tests
after finding that the first set could not produce `bloom` at the value the test
expects, which is recorded at that task.

**Type consistency.** `Organ` and `Structure` are defined once, in Task 5, and used by 6 to 11. `Structure` gains `plausibilityScore` in Task 5 as noted in Task 10. `Phyllotaxis` is defined in Task 6 and consumed in Task 7's `ShootConfig`. `ThermalState` is defined in Task 3 and consumed in Task 4. `WeatherDay` is defined in Task 2 and consumed in Task 3. `makeOrgan(kind, transform, length, width, children?)` is the single constructor, defined in Task 5 and used everywhere afterwards.
