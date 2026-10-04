import { describe, expect, it } from 'vitest'
import { hash32, pickWeighted, rngFrom } from '../src/rng.ts'

describe('hash32', () => {
  it('is deterministic for the same input', () => {
    expect(hash32('rosemary')).toBe(hash32('rosemary'))
  })

  it('returns an unsigned 32-bit integer', () => {
    for (const s of ['', 'a', 'rosemary', 'Jacaranda mimosifolia', '✮']) {
      const h = hash32(s)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(2 ** 32)
    }
  })

  it('separates similar inputs', () => {
    expect(hash32('Amara')).not.toBe(hash32('Amara '))
    expect(hash32('a')).not.toBe(hash32('b'))
  })
})

describe('rngFrom', () => {
  it('produces the same sequence for the same seed, forever', () => {
    const a = rngFrom('Lupin')
    const b = rngFrom('Lupin')
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 8 }, rngFrom('Amara'))
    const b = Array.from({ length: 8 }, rngFrom('Kofi'))
    expect(a).not.toEqual(b)
  })

  it('stays within [0, 1)', () => {
    const r = rngFrom('bounds')
    for (let i = 0; i < 1000; i += 1) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is roughly uniform', () => {
    const r = rngFrom('uniform')
    const buckets = new Array<number>(10).fill(0)
    const n = 20_000
    for (let i = 0; i < n; i += 1) {
      const idx = Math.floor(r() * 10)
      buckets[idx] = (buckets[idx] ?? 0) + 1
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 - n / 50)
      expect(count).toBeLessThan(n / 10 + n / 50)
    }
  })
})

describe('pickWeighted', () => {
  it('selects by cumulative weight', () => {
    expect(pickWeighted([1, 0, 0], 0.0)).toBe(0)
    expect(pickWeighted([1, 0, 0], 0.99)).toBe(0)
    expect(pickWeighted([0, 1, 0], 0.5)).toBe(1)
    expect(pickWeighted([0, 0, 1], 0.999)).toBe(2)
  })

  it('respects relative weights', () => {
    const counts = [0, 0]
    const r = rngFrom('weights')
    for (let i = 0; i < 10_000; i += 1) {
      const idx = pickWeighted([0.25, 0.75], r())
      counts[idx] = (counts[idx] ?? 0) + 1
    }
    expect(counts[0]).toBeGreaterThan(2200)
    expect(counts[0]).toBeLessThan(2800)
  })

  it('handles an unnormalised distribution', () => {
    expect(pickWeighted([3, 1], 0.7)).toBe(0)
    expect(pickWeighted([3, 1], 0.8)).toBe(1)
  })

  it('returns the last index when r is at the top of the range', () => {
    expect(pickWeighted([0.5, 0.5], 0.999999)).toBe(1)
  })

  it('throws on an all-zero distribution', () => {
    expect(() => pickWeighted([0, 0], 0.5)).toThrow(/zero/i)
  })
})
