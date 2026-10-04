import {
  SPECIES,
  express,
  expressPlant,
  founderGenome,
  genomeId,
  serialiseGenome,
  type SpeciesTemplate,
} from '../index.ts'

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === undefined || !token.startsWith('--')) continue
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) continue
    args[token.slice(2)] = value
    i += 1
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

const args = parseArgs(process.argv.slice(2))
const species = findSpecies(args['species'] ?? 'rosemary')
const seed = args['seed'] ?? 'unnamed'
const genome = founderGenome(species, seed)

process.stdout.write(
  `${JSON.stringify(
    {
      species: species.id,
      binomial: species.binomial,
      lineage: species.lineage,
      lifecycle: species.lifecycle,
      seed,
      genomeId: genomeId(genome),
      genome: JSON.parse(serialiseGenome(genome)) as unknown,
      // Both layers, so the difference between the genotype and the plant is
      // visible rather than implied.
      genomicPhenotype: express(genome),
      plant: expressPlant(genome, species),
    },
    null,
    2,
  )}\n`,
)
