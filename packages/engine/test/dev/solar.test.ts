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
  it('is a little over twelve hours at the equator all year', () => {
    // Real equatorial daylength is about 12h07m rather than exactly 12h,
    // because refraction lifts the sun into view at both ends of the day.
    for (const day of [1, 80, 172, 264, 355]) {
      const hours = dayLengthHours(day, 0)
      expect(hours, `day ${day}`).toBeGreaterThan(11.9)
      expect(hours, `day ${day}`).toBeLessThan(12.3)
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
