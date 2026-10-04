import { describe, expect, it } from 'vitest'
import { EPISTASIS, applyEpistasis } from '../src/epistasis.ts'
import type { MutablePhenotype } from '../src/phenotype.ts'

function base(): MutablePhenotype {
  return {
    discrete: {
      'pigment.anthocyanidin': {
        expressed: ['none'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
      'pigment.carotenoid': {
        expressed: ['none'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
      'pigment.petal.chlorophyll': {
        expressed: ['none'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
      'flower.doubling': {
        expressed: ['single'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
    },
    quantitative: {
      'pigment.hue': 0,
      'pigment.saturation': 0,
      'pigment.lightness': 0.92,
      'pigment.intensity': 0,
      'pigment.copigment': 0,
      'pigment.vacuolar.ph': 0,
      'petal.count': 5,
      'flower.fertility': 1,
    },
  }
}

function withWinner(
  phenotype: MutablePhenotype,
  locusId: string,
  name: string,
  winner: number,
): MutablePhenotype {
  phenotype.discrete[locusId] = {
    expressed: [name],
    winner,
    blended: false,
    secondaryWeight: 0,
  }
  return phenotype
}

describe('the colour pathway', () => {
  it('leaves an anthocyanin-free, carotenoid-free flower near white', () => {
    const p = applyEpistasis(base())
    expect(p.quantitative['pigment.saturation']).toBeLessThan(0.1)
    expect(p.quantitative['pigment.lightness']).toBeGreaterThan(0.85)
  })

  it('gives pelargonidin a warm hue', () => {
    const p = applyEpistasis(withWinner(base(), 'pigment.anthocyanidin', 'pelargonidin', 1))
    expect(p.quantitative['pigment.hue']).toBeGreaterThan(0)
    expect(p.quantitative['pigment.hue']).toBeLessThan(60)
  })

  it('gives delphinidin a violet hue', () => {
    const p = applyEpistasis(withWinner(base(), 'pigment.anthocyanidin', 'delphinidin', 3))
    expect(p.quantitative['pigment.hue']).toBeGreaterThan(250)
    expect(p.quantitative['pigment.hue']).toBeLessThan(310)
  })

  it('reaches blue only with delphinidin, copigment and pH together', () => {
    const delphinidinOnly = applyEpistasis(
      withWinner(base(), 'pigment.anthocyanidin', 'delphinidin', 3),
    )
    const everything = base()
    withWinner(everything, 'pigment.anthocyanidin', 'delphinidin', 3)
    everything.quantitative['pigment.copigment'] = 0.9
    everything.quantitative['pigment.vacuolar.ph'] = 0.9
    const blue = applyEpistasis(everything)

    expect(delphinidinOnly.quantitative['pigment.hue']).toBeGreaterThan(270)
    expect(blue.quantitative['pigment.hue']).toBeLessThan(260)
    expect(blue.quantitative['pigment.hue']).toBeGreaterThan(210)
    expect(blue.quantitative['pigment.hue']).toBeLessThan(
      delphinidinOnly.quantitative['pigment.hue'] ?? 0,
    )
  })

  it('never reaches blue from cyanidin, however much copigment is present', () => {
    const p = base()
    withWinner(p, 'pigment.anthocyanidin', 'cyanidin', 2)
    p.quantitative['pigment.copigment'] = 1
    p.quantitative['pigment.vacuolar.ph'] = 1
    expect(applyEpistasis(p).quantitative['pigment.hue']).toBeGreaterThan(280)
  })

  it('lays anthocyanin over carotenoid for a bronzed flower', () => {
    const p = base()
    withWinner(p, 'pigment.anthocyanidin', 'pelargonidin', 1)
    withWinner(p, 'pigment.carotenoid', 'yellow', 1)
    const bronzed = applyEpistasis(p)
    expect(bronzed.quantitative['pigment.saturation']).toBeGreaterThan(0.4)
  })

  it('gives a pure yellow flower with carotenoid alone', () => {
    const p = withWinner(base(), 'pigment.carotenoid', 'yellow', 1)
    const yellow = applyEpistasis(p)
    expect(yellow.quantitative['pigment.hue']).toBeGreaterThan(35)
    expect(yellow.quantitative['pigment.hue']).toBeLessThan(70)
    expect(yellow.quantitative['pigment.saturation']).toBeGreaterThan(0.3)
  })

  it('gives a pure green flower when chlorophyll is the only pigment', () => {
    const p = withWinner(base(), 'pigment.petal.chlorophyll', 'green', 1)
    const green = applyEpistasis(p)
    expect(green.quantitative['pigment.hue']).toBeGreaterThan(70)
    expect(green.quantitative['pigment.hue']).toBeLessThan(150)
  })

  it('darkens and muddies a pigmented petal rather than greening it', () => {
    const p = withWinner(base(), 'pigment.anthocyanidin', 'delphinidin', 3)
    withWinner(p, 'pigment.petal.chlorophyll', 'green', 1)
    const muddy = applyEpistasis(p)
    // Hue must still read as violet. Chlorophyll absorbs, it does not repaint.
    expect(muddy.quantitative['pigment.hue']).toBeGreaterThan(250)
    expect(muddy.quantitative['pigment.hue']).toBeLessThan(310)
    expect(muddy.quantitative['pigment.saturation']).toBeLessThan(0.2)
    expect(muddy.quantitative['pigment.lightness']).toBeLessThan(0.5)
  })

  it('keeps a yellow flower yellow-green, not pure green', () => {
    const p = withWinner(base(), 'pigment.carotenoid', 'yellow', 1)
    withWinner(p, 'pigment.petal.chlorophyll', 'green', 1)
    const olive = applyEpistasis(p)
    expect(olive.quantitative['pigment.hue']).toBeGreaterThan(35)
    expect(olive.quantitative['pigment.hue']).toBeLessThan(70)
    expect(olive.quantitative['pigment.saturation']).toBeLessThan(0.4)
  })
})

describe('the doubling tradeoff', () => {
  it('reduces fertility for a double flower', () => {
    const p = withWinner(base(), 'flower.doubling', 'double', 1)
    const doubled = applyEpistasis(p)
    expect(doubled.quantitative['flower.fertility']).toBeLessThan(1)
    expect(doubled.quantitative['flower.fertility']).toBeGreaterThan(0)
  })

  it("leaves a single flower's fertility alone", () => {
    const p = applyEpistasis(base())
    expect(p.quantitative['flower.fertility']).toBe(1)
  })
})

describe('applyEpistasis', () => {
  it('runs every rule with a declared id', () => {
    for (const rule of EPISTASIS) expect(rule.id.length).toBeGreaterThan(0)
  })

  it('mutates its working copy and returns it', () => {
    const p = base()
    expect(applyEpistasis(p)).toBe(p)
  })
})
