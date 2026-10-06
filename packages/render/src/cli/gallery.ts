import { writeFileSync } from 'node:fs'
import {
  SPECIES,
  develop,
  founderGenome,
  sceneFromShoot,
  shootFor,
  type SpeciesTemplate,
} from '@ink-garden/engine'
import { renderScene, toSvg } from '../index.ts'
import { LOCI } from '../../../engine/src/loci.ts'
import { setAlleleByName, setQuantitative } from '../../../engine/test/helpers.ts'

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

// How much of a compound leaf's subdivision to build at this output size.
//
// The first attempt scaled this straight with the target and reduced a
// jacaranda to four pinnae of four pinnules at phone size, on the reasoning
// that detail below a pixel is not detail. That reasoning is WRONG for
// foliage. A pinnule under a pixel still contributes to the mass, and the mass
// is what makes a jacaranda read as feathery; the aggregate of sub-pixel
// leaflets is the texture, not waste. The render showed bare pinna ribs where
// foliage should be.
//
// So the floor is high: this trims the extreme case and never below about
// two-thirds of full subdivision.
const targetWidth = Number.parseInt(args['width'] ?? '1200', 10)
const detail = Math.max(0.66, Math.min(1, 0.5 + (targetWidth / 1000) * 0.5))
const precision = targetWidth >= 1000 ? 2 : 1
// Which point in the plant's year to draw. The shoot used to ignore this, so a
// vegetative plant and a flowering one were the same picture.
const stage = args['stage'] ?? 'bloom'

chosen.forEach((species, row) => {
  seeds.forEach((seed, col) => {
    let genome = founderGenome(species, seed)
    // --set trait=value forces a quantitative trait, so an extreme can be
    // looked at rather than hunted for among seedlings.
    for (const spec of (args['allele'] ?? '').split(',').filter(Boolean)) {
      const [locusId, allele] = spec.split('=')
      if (locusId === undefined || allele === undefined) continue
      genome = setAlleleByName(genome, locusId, allele, allele)
    }
    for (const spec of (args['set'] ?? '').split(',').filter(Boolean)) {
      const [trait, value] = spec.split('=')
      if (trait === undefined || value === undefined) continue
      const locus = LOCI.find((l) => l.kind === 'quantitative' && l.trait === trait)
      if (locus === undefined) continue
      genome = setQuantitative(genome, locus.id, Number(value), Number(value))
    }
    const { shoot, phenotype, seed: plantSeed } = shootFor(genome, species, stage)
    const scene = sceneFromShoot(shoot, phenotype, species, plantSeed, { detail })
    const rendered = renderScene(scene, { padding: 16, precision })

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
        `organs ${scene.shapes.length}  height ${(scene.maxY - scene.minY).toFixed(1)}  spread ${(scene.maxX - scene.minX).toFixed(1)}</text>`,
    )
  })
})

// The ink layer, applied to the whole sheet rather than per cell, so one
// turbulence field runs across the paper as it would on a real one.
const ink = args['ink'] === 'true'
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${parts.join('\n')}
</svg>`
const svg = ink
  ? toSvg(
      {
        shapes: [],
        minX: 0,
        minY: 0,
        maxX: width,
        maxY: height,
      },
      { ink: true, seed: args['seed'] ?? 'gallery' },
    ).replace('</svg>', `${sheet.replace(/<\/?svg[^>]*>/g, '')}</svg>`)
  : `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#faf7ef"/>
${parts.join('\n')}
</svg>
`
const out = args['out'] ?? 'gallery.svg'
writeFileSync(out, svg)
process.stdout.write(`wrote ${out}: ${chosen.length} species x ${seedCount} seeds\n`)
for (const species of chosen) {
  const genome = founderGenome(species, seeds[0] ?? 'x')
  const { shoot, phenotype, seed: plantSeed } = shootFor(genome, species, stage)
  const scene = sceneFromShoot(shoot, phenotype, species, plantSeed, { detail })
  const structure = develop({ genome, species })
  process.stdout.write(
    `  ${species.id.padEnd(11)} habit ${(phenotype.discrete['habit.growth_form']?.expressed[0] ?? '?').padEnd(8)}` +
      ` outline ${(phenotype.discrete['leaf.outline']?.expressed[0] ?? '?').padEnd(13)}` +
      ` margin ${(phenotype.discrete['leaf.margin']?.expressed[0] ?? '?').padEnd(11)}` +
      ` shapes ${String(scene.shapes.length).padStart(3)}` +
      `  height ${(scene.maxY - scene.minY).toFixed(1).padStart(5)}` +
      `  spread ${(scene.maxX - scene.minX).toFixed(1).padStart(5)}` +
      `  organs ${structure.organCount}\n`,
  )
}
void toSvg
