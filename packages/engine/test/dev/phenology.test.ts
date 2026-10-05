import { describe, expect, it } from 'vitest'
import {
  furthestPhenology,
  phenologyAt,
  phenologyOver,
  stageRank,
} from '../../src/dev/phenology.ts'
import type { ThermalState } from '../../src/dev/thermal.ts'
import { DERIVED_TRAITS, type MutablePhenotype } from '../../src/phenotype.ts'
import { DANDELION, ROSEMARY, type SpeciesTemplate } from '../../src/species.ts'
import { weatherSeries } from '../../src/dev/weather.ts'

const state = (accumulated: number, chilledHours = 0): ThermalState => ({
  accumulated,
  days: 10,
  chilledHours,
})

/** A phenotype carrying only the traits phenology reads. */
function phenotype(
  overrides: Partial<Record<string, number>> = {},
): MutablePhenotype {
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
      'thermal.constant': ROSEMARY.baseline.thermalConstant,
      'photoperiod.critical': 12,
      'vernalization.hours': 100,
      'dormancy.depth': 0.35,
      ...overrides,
    },
  }
}

const LONG_DAY = 16
const SHORT_DAY = 8
const NEUTRAL_DAY = 12

describe('phenologyAt', () => {
  it('starts at germination with no accumulated warmth', () => {
    expect(phenologyAt(state(0), phenotype(), ROSEMARY, NEUTRAL_DAY).stage).toBe(
      'germination',
    )
  })

  it('passes through juvenile, vegetative, bud and bloom as warmth accumulates', () => {
    const p = phenotype()
    const stages = [0, 200, 700, 1300, 1500].map(
      (gdd) => phenologyAt(state(gdd), p, ROSEMARY, NEUTRAL_DAY).stage,
    )
    expect(stages).toEqual(['germination', 'juvenile', 'vegetative', 'bud', 'bloom'])
  })

  it('reports progress within a stage between zero and one', () => {
    for (const gdd of [0, 100, 400, 900, 1399, 2000]) {
      const progress = phenologyAt(state(gdd), phenotype(), ROSEMARY, NEUTRAL_DAY)
        .progress
      expect(progress, `at ${gdd}`).toBeGreaterThanOrEqual(0)
      expect(progress, `at ${gdd}`).toBeLessThanOrEqual(1)
    }
  })

  it('never moves backwards as warmth accumulates', () => {
    const order = ['germination', 'juvenile', 'vegetative', 'bud', 'bloom']
    const p = phenotype()
    let previous = -1
    for (let gdd = 0; gdd <= 4000; gdd += 25) {
      const stage = phenologyAt(state(gdd), p, ROSEMARY, NEUTRAL_DAY).stage
      const index = order.indexOf(stage)
      expect(index, `at ${gdd}`).toBeGreaterThanOrEqual(previous)
      previous = index
    }
  })

  it('holds at bud for a long-day plant in short days, however warm', () => {
    const longDay = phenotype()
    longDay.discrete['photoperiod.response'] = {
      expressed: ['long.day'],
      winner: 2,
      blended: false,
      secondaryWeight: 0,
    }
    expect(phenologyAt(state(5000), longDay, ROSEMARY, SHORT_DAY).stage).toBe('bud')
  })

  it('lets a long-day plant bloom in long days', () => {
    const longDay = phenotype()
    longDay.discrete['photoperiod.response'] = {
      expressed: ['long.day'],
      winner: 2,
      blended: false,
      secondaryWeight: 0,
    }
    expect(phenologyAt(state(5000), longDay, ROSEMARY, LONG_DAY).stage).toBe('bloom')
  })

  it('holds a short-day plant in long days', () => {
    const shortDay = phenotype()
    shortDay.discrete['photoperiod.response'] = {
      expressed: ['short.day'],
      winner: 1,
      blended: false,
      secondaryWeight: 0,
    }
    expect(phenologyAt(state(5000), shortDay, ROSEMARY, LONG_DAY).stage).toBe('bud')
    expect(phenologyAt(state(5000), shortDay, ROSEMARY, SHORT_DAY).stage).toBe('bloom')
  })

  it('holds at bud until vernalisation is satisfied', () => {
    const needsChill = phenotype()
    needsChill.discrete['vernalization.required'] = {
      expressed: ['required'],
      winner: 1,
      blended: false,
      secondaryWeight: 0,
    }
    expect(phenologyAt(state(5000, 10), needsChill, ROSEMARY, NEUTRAL_DAY).stage).toBe(
      'bud',
    )
    expect(phenologyAt(state(5000, 200), needsChill, ROSEMARY, NEUTRAL_DAY).stage).toBe(
      'bloom',
    )
  })

  it('scales the budget with the species, not a fixed number', () => {
    const quick: SpeciesTemplate = {
      ...ROSEMARY,
      baseline: { ...ROSEMARY.baseline, thermalConstant: 200 },
    }
    expect(phenologyAt(state(300), phenotype(), quick, NEUTRAL_DAY).stage).toBe('bloom')
  })

  it('treats a zero budget as instantly mature rather than dividing by zero', () => {
    const instant: SpeciesTemplate = {
      ...ROSEMARY,
      baseline: { ...ROSEMARY.baseline, thermalConstant: 0 },
    }
    const result = phenologyAt(state(0), phenotype(), instant, NEUTRAL_DAY)
    expect(result.stage).toBe('bloom')
    expect(Number.isFinite(result.progress)).toBe(true)
  })

  it('is deterministic', () => {
    const p = phenotype()
    expect(phenologyAt(state(1300), p, ROSEMARY, NEUTRAL_DAY)).toEqual(
      phenologyAt(state(1300), p, ROSEMARY, NEUTRAL_DAY),
    )
  })
})

describe('latching and the day-by-day driver', () => {
  it('never moves backwards between two stages', () => {
    const bloom = { stage: 'bloom' as const, progress: 0.9 }
    const bud = { stage: 'bud' as const, progress: 1 }
    expect(furthestPhenology(bloom, bud)).toBe(bloom)
    expect(furthestPhenology(bud, bloom)).toBe(bloom)
  })

  it('ranks stages in life order', () => {
    expect(stageRank('germination')).toBeLessThan(stageRank('juvenile'))
    expect(stageRank('juvenile')).toBeLessThan(stageRank('bloom'))
  })

  it('does not let a plant that has bloomed return to bud, even over a real year', () => {
    // This is the bug the day-by-day driver exists to prevent: across a real
    // season the daylength oscillates, so an unlatched gate opens and closes
    // and a dandelion blooms in autumn and un-blooms in winter.
    const p = phenotype()
    for (const [lat, elev, start] of [
      [55.86, 0, 100],
      [-1.29, 1795, 100],
      [55.86, 0, 250],
    ] as const) {
      const series = weatherSeries(600, lat, start, elev)
      const result = phenologyOver(series, p, DANDELION, lat)
      expect(stageRank(result.stage), `lat ${lat} start ${start}`).toBeGreaterThanOrEqual(0)
      // Compare against every prefix: the result must be the furthest reached.
      for (let n = 0; n < series.length; n += 25) {
        const prefix = phenologyOver(series.slice(0, n), p, DANDELION, lat)
        expect(stageRank(prefix.stage)).toBeLessThanOrEqual(stageRank(result.stage))
      }
    }
  })

  it('blooms a dandelion within months in the tropics', () => {
    const p = phenotype({ 'thermal.constant': DANDELION.baseline.thermalConstant })
    const series = weatherSeries(180, -1.29, 100, 1795)
    expect(phenologyOver(series, p, DANDELION, -1.29).stage).toBe('bloom')
  })

  it('does not bloom a dandelion in a Glasgow winter', () => {
    const p = phenotype({ 'thermal.constant': DANDELION.baseline.thermalConstant })
    const series = weatherSeries(60, 55.86, 330, 0)
    const stage = phenologyOver(series, p, DANDELION, 55.86).stage
    expect(stageRank(stage)).toBeLessThan(stageRank('bloom'))
  })

  it('is deterministic', () => {
    const p = phenotype()
    const series = weatherSeries(200, 55.86, 100)
    expect(phenologyOver(series, p, ROSEMARY, 55.86)).toEqual(
      phenologyOver(series, p, ROSEMARY, 55.86),
    )
  })

  it('handles an empty series as germination', () => {
    expect(phenologyOver([], phenotype(), ROSEMARY, 55.86).stage).toBe('germination')
  })
})
