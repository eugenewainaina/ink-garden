import {
  SPECIES,
  expressPlant,
  founderGenome,
  reproduce,
  type Genome,
  type SpeciesTemplate,
} from '../index.ts'

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
    throw new Error(
      `Unknown species "${id}". Known: ${SPECIES.map((s) => s.id).join(', ')}`,
    )
  }
  return found
}

interface Stat {
  min: number
  max: number
  mean: number
  variance: number
}

function statistic(values: readonly number[]): Stat {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, variance: 0 }
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let sum = 0
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  const mean = sum / values.length
  let squares = 0
  for (const v of values) squares += (v - mean) * (v - mean)
  return { min, max, mean, variance: squares / values.length }
}

/**
 * Breed a closed population for N generations.
 *
 * This is the plausibility harness for the art gate: it reports the range each
 * trait reaches after several generations of recombination, which is how we
 * check that breeding does not drift into nonsense. It is not a simulation of
 * a user's choices.
 */
function breed(
  species: SpeciesTemplate,
  count: number,
  generations: number,
): Genome[] {
  let population = Array.from({ length: count }, (_, i) =>
    founderGenome(species, `${species.id}-founder-${i}`),
  )

  for (let generation = 0; generation < generations; generation += 1) {
    const next: Genome[] = []
    for (let i = 0; i < count; i += 1) {
      const a = population[i % population.length]
      const b = population[(i * 7 + 3) % population.length]
      if (a === undefined || b === undefined) continue
      next.push(reproduce(`${species.id}-g${generation}-${i}`, a, b))
    }
    population = next
  }
  return population
}

const args = parseArgs(process.argv.slice(2))
const species = findSpecies(args['species'] ?? 'rosemary')
const count = Number.parseInt(args['count'] ?? '60', 10)
const generations = Number.parseInt(args['generations'] ?? '8', 10)
const asJson = args['json'] === 'true'

const population = breed(species, count, generations)

const perTrait = new Map<string, number[]>()
let decanalised = 0
let doubled = 0

for (const genome of population) {
  const phenotype = expressPlant(genome, species)
  if (phenotype.discrete['flower.canalisation']?.expressed[0] === 'decanalised') {
    decanalised += 1
  }
  if (phenotype.discrete['flower.doubling']?.expressed[0] === 'double') doubled += 1

  for (const [trait, value] of Object.entries(phenotype.quantitative)) {
    const bucket = perTrait.get(trait)
    if (bucket === undefined) perTrait.set(trait, [value])
    else bucket.push(value)
  }
}

const traits: Record<string, Stat> = {}
for (const [trait, values] of [...perTrait.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  traits[trait] = statistic(values)
}

const result = {
  species: species.id,
  generations,
  sampleSize: population.length,
  decanalised,
  doubled,
  traits,
}

if (asJson) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else {
  const lines = [
    `${species.commonName} — ${generations} generations, n=${population.length}`,
    `decanalised ${decanalised}   doubled ${doubled}`,
    '',
  ]
  for (const [trait, stat] of Object.entries(traits)) {
    lines.push(
      `${trait.padEnd(22)} min ${stat.min.toFixed(2).padStart(8)}  ` +
        `mean ${stat.mean.toFixed(2).padStart(8)}  ` +
        `max ${stat.max.toFixed(2).padStart(8)}  ` +
        `var ${stat.variance.toFixed(3)}`,
    )
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}
