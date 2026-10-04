import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

const run = (script: string, args: string[]): string =>
  execFileSync('node', [`src/cli/${script}.ts`, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
  })

describe('dump CLI', () => {
  it('prints the genome, the genomic phenotype and the plant', () => {
    const out = run('dump', ['--species', 'rosemary', '--seed', 'Lupin'])
    const parsed = JSON.parse(out) as {
      species: string
      seed: string
      genomeId: string
      genome: { a: number[][] }
      genomicPhenotype: {
        discrete: Record<string, unknown>
        quantitative: Record<string, number>
      }
      plant: {
        discrete: Record<string, unknown>
        quantitative: Record<string, number>
      }
    }
    expect(parsed.species).toBe('rosemary')
    expect(parsed.seed).toBe('Lupin')
    expect(parsed.genome.a.length).toBeGreaterThan(0)
    expect(Object.keys(parsed.genomicPhenotype.discrete).length).toBeGreaterThan(0)

    // The genomic layer must not invent a petal count; the plant layer must.
    expect(parsed.genomicPhenotype.quantitative['petal.count']).toBeUndefined()
    expect(parsed.plant.quantitative['petal.count']).toBeGreaterThan(0)
    expect(parsed.plant.quantitative['height']).toBeGreaterThan(0)
  })

  it('is deterministic across runs', () => {
    const a = run('dump', ['--species', 'jacaranda', '--seed', 'Amara'])
    const b = run('dump', ['--species', 'jacaranda', '--seed', 'Amara'])
    expect(a).toBe(b)
  })

  it('rejects an unknown species', () => {
    expect(() => run('dump', ['--species', 'nope', '--seed', 'x'])).toThrow()
  })
})

describe('descendants CLI', () => {
  it('reports per-trait statistics over generations', () => {
    const out = run('descendants', [
      '--species',
      'dandelion',
      '--count',
      '40',
      '--generations',
      '5',
      '--json',
    ])
    const parsed = JSON.parse(out) as {
      generations: number
      sampleSize: number
      doubled: number
      traits: Record<string, { min: number; max: number; mean: number; variance: number }>
    }
    expect(parsed.generations).toBe(5)
    expect(parsed.sampleSize).toBe(40)
    const height = parsed.traits['height']
    if (height === undefined) throw new Error('expected a height statistic')
    expect(height.max).toBeGreaterThanOrEqual(height.min)
    expect(height.variance).toBeGreaterThanOrEqual(0)
    // Petal count is real at this layer, which is the point of the harness.
    expect(parsed.traits['petal.count']).toBeDefined()
  })

  it('keeps petal counts near the species value over many generations', () => {
    const out = run('descendants', [
      '--species',
      'rosemary',
      '--count',
      '30',
      '--generations',
      '12',
      '--json',
    ])
    const parsed = JSON.parse(out) as {
      traits: Record<string, { min: number; max: number }>
    }
    const petals = parsed.traits['petal.count']
    if (petals === undefined) throw new Error('expected petal.count')
    // Canalisation holds across twelve generations, so the spread is only the
    // doubled flowers rather than a drift toward nonsense.
    expect(petals.min).toBeGreaterThan(0)
    expect(petals.max).toBeLessThan(20)
  })

  it('stays finite for every trait over many generations', () => {
    const out = run('descendants', [
      '--species',
      'spearmint',
      '--count',
      '30',
      '--generations',
      '12',
      '--json',
    ])
    const parsed = JSON.parse(out) as {
      traits: Record<string, { min: number; max: number; mean: number }>
    }
    for (const [trait, stat] of Object.entries(parsed.traits)) {
      expect(Number.isFinite(stat.min), trait).toBe(true)
      expect(Number.isFinite(stat.max), trait).toBe(true)
      expect(Number.isFinite(stat.mean), trait).toBe(true)
      expect(stat.min).toBeLessThanOrEqual(stat.max)
    }
  })
})
