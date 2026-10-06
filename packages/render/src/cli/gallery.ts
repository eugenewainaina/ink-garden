import { writeFileSync } from 'node:fs'
import {
  SPECIES,
  develop,
  expressPlant,
  founderGenome,
  genomeId,
  sceneFromStructure,
  type SpeciesTemplate,
} from '@ink-garden/engine'
import { renderScene, toSvg } from '../index.ts'

/**
 * Render a sheet of plants.
 *
 * The first thing in this project that produces a picture of a whole plant.
 * Flat fills on purpose: the question here is whether the SHAPE reads as the
 * plant it claims to be, and a wrong shape cannot be rescued by brushwork.
 */

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

const CELL_W = 400
const CELL_H = 420
const PAD = 24
const LABEL_H = 26

const args = parseArgs(process.argv.slice(2))
const seedCount = Number.parseInt(args['seeds'] ?? '3', 10)
const seeds = Array.from({ length: seedCount }, (_, i) => args['seed'] ?? `gallery-${i}`)
const chosen: readonly SpeciesTemplate[] =
  args['species'] === undefined || args['species'] === 'all'
    ? SPECIES
    : SPECIES.filter((s) => s.id === args['species'])

if (chosen.length === 0) {
  throw new Error(`Unknown species. Known: ${SPECIES.map((s) => s.id).join(', ')}`)
}

const width = PAD * 2 + CELL_W * seedCount
const height = PAD * 2 + (CELL_H + LABEL_H) * chosen.length
const parts: string[] = []

chosen.forEach((species, row) => {
  seeds.forEach((seed, col) => {
    const genome = founderGenome(species, seed)
    const phenotype = expressPlant(genome, species)
    const structure = develop({ genome, species })
    const scene = sceneFromStructure(structure, phenotype, genomeId(genome))
    const rendered = renderScene(scene, { padding: 16 })

    const cellX = PAD + col * CELL_W
    const cellY = PAD + row * (CELL_H + LABEL_H)
    // Fit the plant into the cell without distorting it.
    const scale = Math.min((CELL_W - 32) / rendered.width, (CELL_H - 46) / rendered.height)
    const offsetX = cellX + (CELL_W - rendered.width * scale) / 2
    const offsetY = cellY + LABEL_H + (CELL_H - LABEL_H - rendered.height * scale) / 2

    parts.push(
      `<rect x="${cellX}" y="${cellY}" width="${CELL_W}" height="${CELL_H}" fill="none" stroke="#e6dfcd"/>`,
    )
    parts.push(
      `<g transform="translate(${offsetX.toFixed(2)},${offsetY.toFixed(2)}) scale(${scale.toFixed(4)})">${rendered.body}</g>`,
    )
    const label =
      col === 0 ? `${species.commonName} (${species.binomial})` : `seed ${col}`
    parts.push(
      `<text x="${cellX + 12}" y="${cellY + 18}" font-family="Georgia,serif" font-size="14" fill="#3a3226">${label}</text>`,
    )
    parts.push(
      `<text x="${cellX + 12}" y="${cellY + CELL_H - 8}" font-family="Georgia,serif" font-size="11" fill="#8a7f6a">` +
        `organs ${structure.organCount}  height ${structure.height.toFixed(1)}  spread ${(structure.root.children.length > 0 ? structure.leafArea.toFixed(0) : '0')} leaf area</text>`,
    )
  })
})

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#faf7ef"/>
${parts.join('\n')}
</svg>
`
const out = args['out'] ?? 'gallery.svg'
writeFileSync(out, svg)
process.stdout.write(`wrote ${out}: ${chosen.length} species x ${seedCount} seeds\n`)
for (const species of chosen) {
  const genome = founderGenome(species, seeds[0] ?? 'x')
  const phenotype = expressPlant(genome, species)
  const structure = develop({ genome, species })
  process.stdout.write(
    `  ${species.id.padEnd(11)} habit ${(phenotype.discrete['habit.growth_form']?.expressed[0] ?? '?').padEnd(8)}` +
      ` outline ${(phenotype.discrete['leaf.outline']?.expressed[0] ?? '?').padEnd(13)}` +
      ` margin ${(phenotype.discrete['leaf.margin']?.expressed[0] ?? '?').padEnd(11)}` +
      ` organs ${String(structure.organCount).padStart(3)}  height ${structure.height.toFixed(1)}\n`,
  )
}
void toSvg
