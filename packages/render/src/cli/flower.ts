import { SPECIES, expressPlant, founderGenome, normalisedTrait } from '@ink-garden/engine'
import type { ProjectedOrgan } from '@ink-garden/engine'
import { flowerShapes } from '../../../engine/src/dev/flower.ts'
import { toSvg } from '../index.ts'
import { hsvToHex } from '../../../engine/src/dev/geometry.ts'

/**
 * One flower, large.
 *
 * A flower is a centimetre across on a plant twenty centimetres tall, so at
 * plant scale its organs are a few pixels and cannot be checked. This draws a
 * single flower on its own, which is the only way to see whether a filament
 * goes where a filament should and whether the style is longer than the
 * stamens it stands among.
 */

const args: Record<string, string> = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i] ?? ''
  if (token.startsWith('--')) args[token.slice(2)] = argv[i + 1] ?? 'true'
}

const species = SPECIES.find((s) => s.id === (args['species'] ?? 'rosemary')) ?? SPECIES[0]
if (species === undefined) throw new Error('no species')

const genome = founderGenome(species, args['seed'] ?? 'flower')
const phenotype = expressPlant(genome, species)
const inflorescence = phenotype.discrete['inflorescence.type']?.expressed[0] ?? 'solitary'

const diameter = phenotype.quantitative['flower.diameter'] ?? 1
// Drawn in centimetres like the rest of the engine, then scaled up hugely.
const ZOOM = 120 / Math.max(0.1, diameter)
const organ: ProjectedOrgan = {
  kind: 'flower',
  x: 0,
  y: 0,
  depth: 0,
  angle: 0,
  scale: 1,
  length: diameter,
  width: diameter,
  facing: 1,
}

// Derived the way the plant derives them, so the inspector cannot drift from
// what a plant actually draws. It had its own hardcoded set and no `calyx` key,
// so the calyx rendered as fill="undefined" - which is black, and looked
// exactly like a colour bug in the engine.
const hue = phenotype.quantitative['pigment.hue'] ?? 300
const sat = phenotype.quantitative['pigment.saturation'] ?? 0.5
const light = phenotype.quantitative['pigment.lightness'] ?? 0.6
const leafHue = species.baseline.leafHue
const leafSat = species.baseline.leafSaturation
const leafLight = species.baseline.leafLightness
const colours = {
  petal: hsvToHex(hue, sat, light),
  centre: hsvToHex(hue - 12, Math.min(1, sat + 0.1), Math.max(0.15, light * 0.78)),
  organ: hsvToHex(leafHue + 8, Math.max(0.08, leafSat * 0.45), Math.min(0.86, leafLight * 1.42)),
  anther: hsvToHex(hue + 18, Math.max(0.15, sat * 0.7), Math.min(0.9, light * 1.15)),
  calyx: hsvToHex(leafHue - 4, Math.max(0.1, leafSat * 0.7), Math.min(0.85, leafLight * 1.3)),
}
const parts = flowerShapes(organ, phenotype, inflorescence, colours, 'inspector')

// Frame the flower by its own extent.
let minX = Infinity
let minY = Infinity
let maxX = -Infinity
let maxY = -Infinity
for (const part of parts) {
  for (const point of part.points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
}
const scene = {
  shapes: parts.map((part) => ({ role: 'flower' as const, points: part.points, fill: part.fill })),
  minX,
  minY,
  maxX,
  maxY,
}

console.log(
  `  ${species.id.padEnd(11)} ${inflorescence.padEnd(9)} ` +
    `petals ${Math.round(phenotype.quantitative['petal.count'] ?? 0)}  ` +
    `stamens ${Math.max(1, Math.round(2 + normalisedTrait(phenotype, 'stamen.count') * 4))}  ` +
    `${phenotype.discrete['stamen.exsertion']?.expressed[0] ?? '-'}  ` +
    `style ${(phenotype.quantitative['carpel.style'] ?? 0).toFixed(2)}  ` +
    `${parts.length} marks`,
)

const out = args['out'] ?? '/tmp/flower.svg'
const { writeFileSync } = await import('node:fs')
writeFileSync(out, toSvg(scene, { ink: false, padding: 8, zoom: ZOOM }))
console.log(`  wrote ${out}`)
