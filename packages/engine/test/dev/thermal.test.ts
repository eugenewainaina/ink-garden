import { describe, expect, it } from 'vitest'
import {
  accumulateThermal,
  chillingHours,
  dayReachingTarget,
  degreeDays,
} from '../../src/dev/thermal.ts'
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
    const cases: ReadonlyArray<readonly [number, number]> = [
      [-10, -2],
      [0, 5],
      [30, 42],
    ]
    for (const [lo, hi] of cases) {
      expect(degreeDays(day(lo, hi), 12, 34)).toBeGreaterThanOrEqual(0)
    }
  })

  it('increases monotonically with warmth', () => {
    let previous = -1
    for (const mean of [-5, 0, 5, 10, 15, 20, 30, 40]) {
      const value = degreeDays(day(mean - 3, mean + 3), 10, 35)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})

describe('chillingHours', () => {
  it('counts a full day when the whole day is below the threshold', () => {
    expect(chillingHours(day(-2, 4), 5)).toBe(24)
  })

  it('counts nothing when the minimum is above the threshold', () => {
    expect(chillingHours(day(8, 16), 5)).toBe(0)
  })

  it('counts part of a day when the threshold falls inside the range', () => {
    // range -1..9, threshold 5: the colder half of the range counts
    const hours = chillingHours(day(-1, 9), 5)
    expect(hours).toBeGreaterThan(0)
    expect(hours).toBeLessThan(24)
  })

  it('counts half a day when the threshold is the mean', () => {
    expect(chillingHours(day(0, 10), 5)).toBeCloseTo(12, 6)
  })

  it('never exceeds a day or goes negative', () => {
    for (const [lo, hi] of [[-20, -10], [-5, 30], [20, 30]] as const) {
      const hours = chillingHours(day(lo, hi), 5)
      expect(hours).toBeGreaterThanOrEqual(0)
      expect(hours).toBeLessThanOrEqual(24)
    }
  })
})

describe('accumulateThermal', () => {
  it('sums degree days over a series', () => {
    const series = [day(15, 25), day(15, 25), day(15, 25)]
    expect(accumulateThermal(series, 10, 35).accumulated).toBeCloseTo(30, 10)
  })

  it('counts the days and the chilling', () => {
    const state = accumulateThermal([day(-2, 4), day(15, 25)], 10, 35, 5)
    expect(state.days).toBe(2)
    expect(state.chilledHours).toBe(24)
  })

  it('is zero for an empty series', () => {
    expect(accumulateThermal([], 10, 35)).toEqual({
      accumulated: 0,
      days: 0,
      chilledHours: 0,
    })
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

  it('accumulates faster in the warm season than the cold one', () => {
    const warm = new Array<WeatherDay>(10).fill(day(18, 28))
    const cold = new Array<WeatherDay>(10).fill(day(0, 6))
    const warmGdd = accumulateThermal(warm, 10, 35).accumulated
    const coldGdd = accumulateThermal(cold, 10, 35).accumulated
    expect(warmGdd).toBeGreaterThan(coldGdd)
    expect(coldGdd).toBe(0)
  })
})

describe('dayReachingTarget', () => {
  it('finds the day a target is passed', () => {
    // 10 GDD per day, target 25 -> index 2 (the third day)
    const series = new Array<WeatherDay>(10).fill(day(15, 25))
    expect(dayReachingTarget(series, 25, 10, 35)).toBe(2)
  })

  it('is null when the target is never reached', () => {
    const series = new Array<WeatherDay>(5).fill(day(0, 6))
    expect(dayReachingTarget(series, 100, 10, 35)).toBeNull()
  })

  it('returns the first day for a zero target', () => {
    const series = new Array<WeatherDay>(3).fill(day(15, 25))
    expect(dayReachingTarget(series, 0, 10, 35)).toBe(0)
  })
})
