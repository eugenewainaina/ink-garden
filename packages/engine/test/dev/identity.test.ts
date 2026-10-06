import { describe, expect, it } from 'vitest'
import { flowerOrgans, petaloidWhorls, whorlIdentity } from '../../src/dev/identity.ts'
import { DERIVED_TRAITS, type MutablePhenotype } from '../../src/phenotype.ts'

/** A phenotype carrying only the traits organ identity reads. */
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
    if (name === undefined) continue
    base.discrete[id] = {
      expressed: [name],
      winner: 1,
      blended: false,
      secondaryWeight: 0,
    }
  }
  for (const [id, value] of Object.entries(quantitative)) {
    if (value === undefined) continue
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
    expect(whorlIdentity(3, p)).toBe('stamen')
  })

  it('turns the third whorl into petals when the flower is double', () => {
    const p = phenotype({ 'flower.organ.identity': 'normal', 'flower.doubling': 'double' })
    expect(whorlIdentity(3, p)).toBe('petal')
    expect(whorlIdentity(4, p)).toBe('carpel')
  })

  it('applies both homeotic mutations at once', () => {
    const p = phenotype({
      'flower.organ.identity': 'sepals.petaloid',
      'flower.doubling': 'double',
    })
    expect([1, 2, 3, 4].map((w) => whorlIdentity(w, p))).toEqual([
      'petal',
      'petal',
      'petal',
      'carpel',
    ])
  })

  it('treats a missing phenotype as the normal flower', () => {
    const p = phenotype()
    expect(whorlIdentity(1, p)).toBe('sepal')
    expect(whorlIdentity(4, p)).toBe('carpel')
  })

  it('rejects a whorl outside one to four', () => {
    const p = phenotype()
    expect(() => whorlIdentity(0, p)).toThrow()
    expect(() => whorlIdentity(5, p)).toThrow()
  })
})

describe('petaloidWhorls', () => {
  it('is just whorl two for a normal single flower', () => {
    expect(petaloidWhorls(phenotype())).toEqual([2])
  })

  it('is whorls one and two for petaloid sepals', () => {
    expect(
      petaloidWhorls(phenotype({ 'flower.organ.identity': 'sepals.petaloid' })),
    ).toEqual([1, 2])
  })

  it('is whorls two and three for a double flower', () => {
    expect(petaloidWhorls(phenotype({ 'flower.doubling': 'double' }))).toEqual([2, 3])
  })
})

describe('flowerOrgans', () => {
  it('produces organs for every whorl, not just the petals', () => {
    const organs = flowerOrgans(phenotype(), 2, 1, 'flower')
    const kinds = new Set(organs.map((o) => o.kind))
    expect(kinds.has('petal')).toBe(true)
    expect(kinds.has('sepal')).toBe(true)
    expect(kinds.has('stamen')).toBe(true)
    expect(kinds.has('carpel')).toBe(true)
  })

  it('distributes the phenotype petal count across the petaloid whorls', () => {
    const organs = flowerOrgans(phenotype(undefined, { 'petal.count': 6 }), 2, 1, 'f')
    expect(organs.filter((o) => o.kind === 'petal').length).toBe(6)
  })

  it('adds petals and removes stamens for a double flower', () => {
    const count = (kind: string, list: readonly { kind: string }[]): number =>
      list.filter((o) => o.kind === kind).length
    const single = flowerOrgans(phenotype({ 'flower.doubling': 'single' }), 2, 1, 'f')
    const double = flowerOrgans(phenotype({ 'flower.doubling': 'double' }), 2, 1, 'f')
    expect(count('petal', double)).toBeGreaterThan(count('petal', single))
    expect(count('stamen', double)).toBe(0)
    expect(count('stamen', single)).toBeGreaterThan(0)
  })

  it('keeps the total petal count right when it is split across two whorls', () => {
    const organs = flowerOrgans(
      phenotype({ 'flower.doubling': 'double' }, { 'petal.count': 8 }),
      2,
      1,
      'f',
    )
    expect(organs.filter((o) => o.kind === 'petal').length).toBe(8)
  })

  it('arranges a whorl radially, with distinct angles', () => {
    const organs = flowerOrgans(phenotype(undefined, { 'petal.count': 8 }), 2, 1, 'f')
    const angles = organs.filter((o) => o.kind === 'petal').map((o) => o.transform.angle)
    expect(new Set(angles.map((a) => Math.round(a))).size).toBe(8)
  })

  it('puts the outer whorls at a larger radius than the inner ones', () => {
    const organs = flowerOrgans(phenotype(), 2, 1, 'f')
    const radius = (kind: string): number => {
      const organ = organs.find((o) => o.kind === kind)
      if (organ === undefined) throw new Error(`no ${kind}`)
      return Math.hypot(organ.transform.x, organ.transform.y)
    }
    expect(radius('sepal')).toBeGreaterThan(radius('carpel'))
  })

  it('handles a zero petal count without producing petals', () => {
    const organs = flowerOrgans(phenotype(undefined, { 'petal.count': 0 }), 2, 1, 'f')
    expect(organs.filter((o) => o.kind === 'petal').length).toBe(0)
  })

  it('is deterministic', () => {
    const p = phenotype()
    expect(flowerOrgans(p, 2, 1, 'seed')).toEqual(flowerOrgans(p, 2, 1, 'seed'))
  })

  it('gives different seeds a different rotational phase, so flowers vary', () => {
    const p = phenotype()
    const a = flowerOrgans(p, 2, 1, 'one').map((o) => o.transform.angle)
    const b = flowerOrgans(p, 2, 1, 'two').map((o) => o.transform.angle)
    expect(a).not.toEqual(b)
  })
})
