import { describe, expect, it } from 'vitest'
import { dayLengthHours } from '../../src/dev/solar.ts'
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

  it('gives a subtropical latitude far less rain than Glasgow', () => {
    // The subtropical high is genuinely dry. If aridity were not modelled,
    // every latitude would rain as much as every other, which is the single
    // least plausible thing a weather model can do.
    const wetFraction = (lat: number): number => {
      let wet = 0
      for (let day = 1; day <= 365; day += 1) {
        if (seasonalDay(day, lat).precipMm > 0.1) wet += 1
      }
      return wet / 365
    }
    expect(wetFraction(25)).toBeLessThan(wetFraction(GLASGOW) * 0.7)
  })

  it('gets Glasgow mean temperature roughly right', () => {
    // Real annual mean is about 9 C. A latitude-only model cannot know about
    // the Gulf Stream, but it should not be off by ten degrees either.
    let sum = 0
    for (let day = 1; day <= 365; day += 1) {
      const d = seasonalDay(day, GLASGOW)
      sum += (d.tMinC + d.tMaxC) / 2
    }
    const mean = sum / 365
    expect(mean).toBeGreaterThan(3)
    expect(mean).toBeLessThan(14)
  })

  it('never reports more sunshine than there is daylight', () => {
    // The plan's sketch had no cap, so a polar winter could report thirteen
    // hours of sunshine in a five hour day.
    for (let day = 1; day <= 365; day += 11) {
      for (const lat of [75, 55.86, 0, -55.86, -75]) {
        const d = seasonalDay(day, lat)
        const daylight = dayLengthHours(day, lat)
        expect(d.sunshineHours, `day ${day} lat ${lat}`).toBeLessThanOrEqual(daylight + 1e-9)
      }
    }
  })

  it('cools with elevation, because a highland is not a sea level', () => {
    const seaLevel = seasonalDay(100, -1.29, 0)
    const highland = seasonalDay(100, -1.29, 1795)
    expect(highland.tMaxC).toBeLessThan(seaLevel.tMaxC - 5)
    expect(highland.tMinC).toBeLessThan(seaLevel.tMinC - 5)
  })

  it('gets Nairobi roughly right once elevation is given', () => {
    // Real Nairobi annual mean is about 19 C at 1,795 m, against 26 or so at
    // the same latitude at sea level.
    let sum = 0
    for (let day = 1; day <= 365; day += 1) {
      const d = seasonalDay(day, -1.29, 1795)
      sum += (d.tMinC + d.tMaxC) / 2
    }
    const mean = sum / 365
    expect(mean).toBeGreaterThan(15)
    expect(mean).toBeLessThan(22)
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

  it('handles an empty series', () => {
    expect(weatherSeries(0, GLASGOW)).toEqual([])
  })
})
