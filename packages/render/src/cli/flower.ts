import { SPECIES, expressPlant, founderGenome, normalisedTrait } from '@ink-garden/engine'
import type { ProjectedOrgan } from '@ink-garden/engine'
import { flowerShapes } from '../../../engine/src/dev/flower.ts'
import { toSvg } from '../index.ts'
import { plantPalette } from '../../../engine/src/dev/geometry.ts'
import { setAlleleByName } from '../../../engine/test/helpers.ts'

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

let genome = founderGenome(species, args['seed'] ?? 'flower')
// The homeotic mutations, so a double flower and a petaloid sepal can actually
// be looked at. Both are recessive in the catalogue, which is why they are rare
// and why forcing them is the only way to check the drawing.
if (args['double'] === 'true') {
  genome = setAlleleByName(genome, 'flower.doubling', 'double', 'double')
}
if (args['petaloid'] === 'true') {
  genome = setAlleleByName(genome, 'flower.organ.identity', 'sepals.petaloid', 'sepals.petaloid')
}
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

// The engine's own palette. This file had a hardcoded copy and it drifted
// twice, missing `calyx` and then `seed`, and a missing key renders as
// fill="undefined" - which is black and looks like an engine fault.
const colours = plantPalette(phenotype, species)
const stage = (args['stage'] ?? 'bloom') as 'bud' | 'bloom' | 'seed'

const parts = flowerShapes(organ, phenotype, inflorescence, colours, 'inspector', stage)

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
