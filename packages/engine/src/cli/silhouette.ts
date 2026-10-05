import { expressPlant } from '../phenotype.ts'
import { founderGenome } from '../genome.ts'
import { SPECIES, type SpeciesTemplate } from '../species.ts'
import { buildShoot, layoutShoot, type Segment } from '../dev/meristem.ts'
import { shootGeometry } from '../dev/shoot.ts'

/**
 * A throwaway silhouette sheet.
 *
 * Not the renderer. No brushwork, no colour, no shading: straight lines where
 * organs are, so that the ARCHITECTURE can be judged before any of the art
 * exists. If a spiral plant does not read as a spiral plant here, no amount of
 * beautiful drawing later will fix it.
 *
 * Each plant is normalised to the same height so shapes are comparable; without
 * that a jacaranda would be twenty times a dandelion and nothing would be
 * visible but one line.
 */

const PANEL_W = 300
const PANEL_H = 400
const COLS = 3
const MARGIN = 40
const LABEL_H = 28
const PLANT_H = 300

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

interface Drawn {
  readonly segments: readonly Segment[]
  readonly scale: number
  readonly offsetY: number
}

function drawPlant(species: SpeciesTemplate, seed: string): Drawn {
  const genome = founderGenome(species, seed)
  const phenotype = expressPlant(genome, species)
  const geometry = shootGeometry(phenotype, species, seed)
  const shoot = buildShoot({ ...geometry, seed })
  const segments = layoutShoot(shoot, 0, 0, 0)

  let minX = 0
  let maxX = 0
  let maxY = 0
  for (const segment of segments) {
    minX = Math.min(minX, segment.x1, segment.x2)
    maxX = Math.max(maxX, segment.x1, segment.x2)
    maxY = Math.max(maxY, segment.y1, segment.y2)
  }
  const width = Math.max(1e-6, maxX - minX)
  const height = Math.max(1e-6, maxY)
  const scale = Math.min(PLANT_H / height, (PANEL_W - 40) / width)
  const centreX = (minX + maxX) / 2
  return { segments, scale, offsetY: -centreX * scale }
}

function panel(drawn: Drawn, x: number, y: number, label: string): string {
  const toX = (px: number): number => x + PANEL_W / 2 + px * drawn.scale
  // SVG grows downward and plants grow upward, so y is negated.
  const toY = (py: number): number => y + PANEL_H - 30 - py * drawn.scale

  const parts: string[] = []
  parts.push(
    `<rect x="${x}" y="${y}" width="${PANEL_W}" height="${PANEL_H}" fill="none" stroke="#e8e0cf"/>`,
  )
  // The ground line.
  parts.push(
    `<line x1="${x + 20}" y1="${y + PANEL_H - 30}" x2="${x + PANEL_W - 20}" y2="${
      y + PANEL_H - 30
    }" stroke="#c9bfa8" stroke-width="1"/>`,
  )
  for (const segment of drawn.segments) {
    const isStem = segment.kind === 'internode'
    parts.push(
      `<line x1="${toX(segment.x1).toFixed(2)}" y1="${toY(segment.y1).toFixed(2)}" ` +
        `x2="${toX(segment.x2).toFixed(2)}" y2="${toY(segment.y2).toFixed(2)}" ` +
        `stroke="${isStem ? '#5b4a33' : '#4f7a3a'}" ` +
        `stroke-width="${isStem ? 2.4 : 1.5}" stroke-linecap="round"/>`,
    )
  }
  parts.push(
    `<text x="${x + 12}" y="${y + 20}" font-family="Georgia,serif" font-size="15" fill="#3a3226">${label}</text>`,
  )
  return parts.join('\n')
}

const args = parseArgs(process.argv.slice(2))
const seedCount = Number.parseInt(args['seeds'] ?? '3', 10)
const seeds = Array.from({ length: seedCount }, (_, i) => `silhouette-${i}`)
const chosen =
  args['species'] === undefined || args['species'] === 'all'
    ? SPECIES
    : SPECIES.filter((s) => s.id === args['species'])
if (chosen.length === 0) {
  throw new Error(`Unknown species. Known: ${SPECIES.map((s) => s.id).join(', ')}`)
}

const rows = chosen.length
const width = MARGIN * 2 + PANEL_W * seedCount
const height = MARGIN * 2 + (PANEL_H + LABEL_H) * rows
const body: string[] = []
for (let r = 0; r < rows; r += 1) {
  const species = chosen[r]
  if (species === undefined) continue
  for (let c = 0; c < seedCount; c += 1) {
    const seed = seeds[c] ?? 'silhouette-0'
    const drawn = drawPlant(species, seed)
    const label =
      c === 0 ? `${species.commonName} (${species.binomial})` : seed.replace('silhouette-', 'seed ')
    body.push(
      panel(drawn, MARGIN + c * PANEL_W, MARGIN + r * (PANEL_H + LABEL_H), label),
    )
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#faf6ec"/>
${body.join('\n')}
</svg>
`
const out = args['out'] ?? 'silhouette.svg'
const { writeFileSync } = await import('node:fs')
writeFileSync(out, svg)
process.stdout.write(`wrote ${out}: ${rows} species x ${seedCount} seeds\n`)
for (const species of chosen) {
  const genome = founderGenome(species, seeds[0] ?? 'x')
  const phenotype = expressPlant(genome, species)
  const geometry = shootGeometry(phenotype, species, seeds[0] ?? 'x')
  const shoot = buildShoot({ ...geometry, seed: seeds[0] ?? 'x' })
  const segments = layoutShoot(shoot)
  process.stdout.write(
    `  ${species.id.padEnd(11)} ${geometry.pattern.padEnd(10)} ` +
      `dominance ${geometry.apicalDominance.toFixed(2)}  ` +
      `angle ${geometry.branchAngle.toFixed(0)}deg  ` +
      `nodes ${geometry.nodes}  organs ${segments.length}\n`,
  )
}
