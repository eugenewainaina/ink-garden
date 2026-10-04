import { describe, expect, it } from 'vitest'
import * as engine from '../src/index.ts'

describe('public API', () => {
  it('exposes the core entry points', () => {
    for (const name of [
      'LOCI',
      'hash32',
      'rngFrom',
      'pickWeighted',
      'founderGenome',
      'express',
      'expressMutable',
      'expressPlant',
      'reproduce',
      'meiosis',
      'serialiseGenome',
      'migrateGenome',
      'defaultDistribution',
      'traitMaximum',
      'SPECIES',
    ]) {
      expect(engine, name).toHaveProperty(name)
    }
  })

  it('grows a plant end to end through every layer', () => {
    const template = engine.ROSEMARY
    const parent = engine.founderGenome(template, 'Lupin')
    const other = engine.founderGenome(template, 'Amara')
    const child = engine.reproduce('Lupin', parent, other)

    // Genomic layer: no species needed.
    const genomic = engine.express(child)
    expect(genomic.discrete['leaf.form']).toBeDefined()
    expect(genomic.quantitative['petal.count']).toBeUndefined()

    // Plant layer: species resolved, petal count real.
    const plant = engine.expressPlant(child, template)
    expect(child.alleles.length).toBe(engine.LOCI.length)
    expect(plant.quantitative['petal.count']).toBeGreaterThan(0)
    expect(plant.quantitative['height']).toBeGreaterThan(0)
    expect(plant.discrete['leaf.form']?.expressed.length).toBeGreaterThan(0)
  })

  it('survives a serialisation round trip after breeding', () => {
    const template = engine.DANDELION
    const a = engine.founderGenome(template, 'a')
    const b = engine.founderGenome(template, 'b')
    const child = engine.reproduce('c', a, b)
    const restored = engine.deserialiseGenome(engine.serialiseGenome(child))
    expect(engine.genomeId(restored)).toBe(engine.genomeId(child))
    expect(engine.expressPlant(restored, template)).toEqual(
      engine.expressPlant(child, template),
    )
  })
})
