import type { Phenotype } from '../phenotype.ts'
import type { SpeciesTemplate } from '../species.ts'
import { leafDecomposition, leafOutline, leafVeins, type Point } from './leaf.ts'
import { DEFAULT_TILT_DEG, placeOrgans, projectOrgans } from './layout.ts'
import { growthFormOf } from './shoot.ts'
import { requiredRadius, taperedRadius } from './allometry.ts'
import { flowerShapes } from './flower.ts'
import type { Shoot } from './meristem.ts'
import type { Organ } from './structure.ts'

/**
 * Flat shapes ready to be painted.
 *
 * The engine decides the shape; the renderer decides the paint. Nothing here
 * knows what SVG or canvas is, so the same scene can be serialised to a file or
 * drawn into a browser.
 */

export interface SceneShape {
  readonly role: Organ['kind']
  /** A closed polygon in plant coordinates, y upward. */
  readonly points: readonly Point[]
  readonly fill: string
  /**
   * An optional edge.
   *
   * A white corolla on pale paper is invisible, and mint's really is white. A
   * botanical illustration draws a faint edge for exactly this reason, so the
   * colour stays true and the flower still reads.
   */
  readonly stroke?: string
  readonly strokeWidth?: number
  /**
   * Whether the polygon closes.
   *
   * Veins are open paths: closing them would draw a line back along the vein to
   * where it started, which on a secondary vein is a visible spur.
   */
  readonly closed?: boolean
}

export interface Scene {
  readonly shapes: readonly SceneShape[]
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/**
 * Convert HSV to a CSS hex colour.
 *
 * Leaf colour is declared by the species as HSV because that is how foliage
 * varies: rosemary reads grey from hairs and wax, which is low SATURATION at
 * the same hue, not a different green.
 */
/**
 * Roughly the width of a polygon, used to scale an outline with its size.
 */
/**
 * How much light reaches an organ.
 *
 * Beer-Lambert extinction through a canopy: light falls off with the leaf area
 * between it and the sun, and the extinction coefficient for a real canopy is
 * typically 0.3 to 0.7. This uses the two things the model has that stand in for
 * that path length, depth toward the viewer and height within the plant, so a
 * leaf buried behind and below others is darker than one at the top and front.
 *
 * It is a light model rather than decoration, which is why it is bounded: the
 * darkest a leaf can get is a fixed fraction of the species' own colour, so the
 * plant never stops being recognisably that plant's green.
 */
const MIN_SHADE = 0.7

function shadeAt(
  organ: { readonly y: number },
  depth: number,
  depthRange: { readonly min: number; readonly max: number },
  tallest: number,
): number {
  const span = Math.max(1e-6, depthRange.max - depthRange.min)
  const towards = (depth - depthRange.min) / span
  const height = tallest > 0 ? Math.max(0, Math.min(1, organ.y / tallest)) : 0
  const lit = 0.55 + 0.45 * towards
  const above = 0.7 + 0.3 * height
  return Math.max(MIN_SHADE, Math.min(1, lit * above))
}

/** Darken a hex fill by a factor, keeping its hue and its ratio. */
function shadeHex(hex: string, factor: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (match?.[1] === undefined) return hex
  const value = Number.parseInt(match[1], 16)
  const channel = (shift: number): string =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * factor)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(16)}${channel(8)}${channel(0)}`
}

function diameterOf(points: readonly Point[]): number {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
  }
  return Number.isFinite(minX) && maxX > minX ? maxX - minX : 0
}

function hsvToHex(hue: number, saturation: number, value: number): string {
  const h = ((hue % 360) + 360) % 360
  const s = Math.max(0, Math.min(1, saturation))
  const v = Math.max(0, Math.min(1, value))
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const sector = Math.floor(h / 60) % 6
  const table: ReadonlyArray<readonly [number, number, number]> = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ]
  const rgb = table[sector] ?? [c, x, 0]
  const channel = (n: number): string =>
    Math.round(Math.max(0, Math.min(1, n + m)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`
}

/** How many points around a lamina. Enough for lobes, cheap for a thousand plants. */
const LAMINA_SAMPLES = 28

/**
 * Turn an organ tree into polygons.
 *
 * The organs already carry absolute positions and in-plane angles from
 * `placeOrgans`, so this only has to give each one a shape and rotate it into
 * place. Leaves get a real lamina; everything axial gets a tapered quad.
 */
export function sceneFromShoot(
  shoot: Shoot,
  phenotype: Phenotype,
  species: SpeciesTemplate,
  seed: string,
  tiltDeg = DEFAULT_TILT_DEG,
): Scene {
  // Foliage colour comes from the species, because it is a species trait:
  // rosemary is grey-green from its hairs and wax, a dandelion is dark green,
  // and a jacaranda is a light yellow-green. Stems are a duller, browner
  // version of the same hue rather than a separate fixed colour.
  const leafFill = hsvToHex(
    species.baseline.leafHue,
    species.baseline.leafSaturation,
    species.baseline.leafLightness,
  )
  const stemFill = hsvToHex(
    species.baseline.leafHue - 22,
    Math.min(1, species.baseline.leafSaturation + 0.14),
    species.baseline.leafLightness * 0.85,
  )

  // Flower colour comes from the pigment loci, which already express correctly:
  // a dandelion at hue 52 is golden yellow, a jacaranda at 271 is blue-purple,
  // a rosemary at 277 is violet-blue.
  const petalFill = hsvToHex(
    phenotype.quantitative['pigment.hue'] ?? 40,
    phenotype.quantitative['pigment.saturation'] ?? 0.5,
    phenotype.quantitative['pigment.lightness'] ?? 0.6,
  )
  const centreFill = hsvToHex(
    (phenotype.quantitative['pigment.hue'] ?? 40) - 12,
    Math.min(1, (phenotype.quantitative['pigment.saturation'] ?? 0.5) + 0.1),
    Math.max(0.15, (phenotype.quantitative['pigment.lightness'] ?? 0.6) * 0.78),
  )
  const petalEdge = hsvToHex(
    (phenotype.quantitative['pigment.hue'] ?? 40) - 20,
    Math.min(1, (phenotype.quantitative['pigment.saturation'] ?? 0.5) + 0.2),
    Math.max(0.2, (phenotype.quantitative['pigment.lightness'] ?? 0.6) * 0.62),
  )
  const colours = { petal: petalFill, centre: centreFill }
  const outline = phenotype.discrete['leaf.outline']?.expressed[0] ?? 'elliptic'
  const margin = phenotype.discrete['leaf.margin']?.expressed[0] ?? 'entire'
  const leafForm = phenotype.discrete['leaf.form']?.expressed[0] ?? 'simple'
  const inflorescence = phenotype.discrete['inflorescence.type']?.expressed[0] ?? 'solitary'
  const laminae = leafDecomposition(leafForm)
  const venation = phenotype.discrete['leaf.venation']?.expressed[0] ?? 'pinnate'
  // A vein is a LIGHTER line on the blade. That is not a stylistic choice: a
  // vein is raised and its bundle sheath is often unpigmented, so it catches
  // light and reads paler than the mesophyll around it. Drawing it darker put
  // it within a few points of a shaded leaf once the light model was added, and
  // 154 veins became invisible.
  const veinFill = hsvToHex(
    species.baseline.leafHue + 4,
    Math.max(0, species.baseline.leafSaturation * 0.6),
    Math.min(0.85, species.baseline.leafLightness * 1.5),
  )

  // How much the midrib turns across the blade, in radians. A real lamina is
  // not a straight line, and curvature is what decides how much of the blade a
  // viewer sees: a straight horizontal leaf is edge-on, an arching one presents
  // its face. A rosette's leaves arch right over, an upright shoot's droop a
  // little. A heritable curvature locus is the natural next step; this is the
  // growth form's share of it.
  const arch = growthFormOf(phenotype) === 'rosette' ? 1.15 : 0.4

  const shapes: SceneShape[] = []
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0

  const include = (point: Point): void => {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }

  const organs = projectOrgans(placeOrgans(shoot), tiltDeg)

  let tallest = 0
  for (const organ of organs) {
    const tip = organ.y + organ.length * organ.scale * Math.cos((organ.angle * Math.PI) / 180)
    if (tip > tallest) tallest = tip
  }

  // Stem thickness comes from the pipe model: the cross-section a stem needs is
  // set by the leaf area it serves, so radius goes as the square root of that
  // area, and it tapers toward the tip because less leaf sits above it. This is
  // what stops a plant being drawn as a bundle of wires regardless of how much
  // foliage it carries.
  const totalLeafArea = shoot.leaves.reduce(
    (sum, leaf) => sum + leaf.length * leaf.width,
    0,
  )
  const baseRadius = requiredRadius(totalLeafArea, tallest)

  // The depth range, for the light model. Taken before drawing so every organ
  // is shaded against the same span rather than against whatever came before it.
  let minDepth = Number.POSITIVE_INFINITY
  let maxDepth = Number.NEGATIVE_INFINITY
  for (const organ of organs) {
    if (organ.depth < minDepth) minDepth = organ.depth
    if (organ.depth > maxDepth) maxDepth = organ.depth
  }
  const depthRange = {
    min: Number.isFinite(minDepth) ? minDepth : 0,
    max: Number.isFinite(maxDepth) ? maxDepth : 0,
  }
  const STEM_FLOOR = Math.max(0.04, tallest * 0.004)
  for (let i = 0; i < organs.length; i += 1) {
    const organ = organs[i]
    if (organ === undefined) continue
    const radians = (organ.angle * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)

    /** Local to world: rotate by the organ's angle from vertical, then place. */
    const place = (local: Point): Point => ({
      x: organ.x + local.x * cos + local.y * sin,
      y: organ.y - local.x * sin + local.y * cos,
    })

    const shade = shadeAt(organ, organ.depth, depthRange, tallest)
    const lit = shade < 0.999

    if (organ.kind === 'flower') {
      for (const part of flowerShapes(organ, phenotype, inflorescence, colours, `${seed}|${i}`)) {
        for (const point of part.points) include(point)
        shapes.push({
          role: 'flower',
          points: part.points,
          fill: lit ? shadeHex(part.fill, shade) : part.fill,
          stroke: petalEdge,
          strokeWidth: Math.max(0.02, diameterOf(part.points) * 0.012),
        })
      }
      continue
    }

    if (organ.kind === 'leaf') {
      const foreshortening = organ.scale
      const drawnLength = organ.length * foreshortening
      const drawnWidth = Math.max(
        organ.width * foreshortening * organ.facing,
        organ.length * foreshortening * 0.16,
      )

      // One lamina for a simple leaf; a rachis and its leaflets for a compound
      // one. A rachis is a lamina with almost no width, so this stays one path
      // rather than two.
      for (let k = 0; k < laminae.length; k += 1) {
        const lamina = laminae[k]
        if (lamina === undefined) continue
        const theta = (lamina.angle * Math.PI) / 180
        const laminaCos = Math.cos(theta)
        const laminaSin = Math.sin(theta)
        const baseX = lamina.offset.x * drawnLength
        const baseY = lamina.offset.y * drawnLength

        const local = leafOutline(
          {
            length: drawnLength * lamina.scale,
            // A lamina turned edge-on is a sliver, not a full leaf, which lets a
            // rosette read as individual leaves instead of one mass. It is
            // floored so a genuinely narrow leaf does not vanish at drawing
            // scale.
            width: Math.max(drawnWidth * lamina.scale * lamina.widthFactor, 0.02),
            outline,
            margin,
            seed: `${seed}|leaf|${i}|${k}`,
            curve: arch,
          },
          lamina.scale >= 1 ? LAMINA_SAMPLES : Math.round(LAMINA_SAMPLES * 0.6),
        ).map((point: Point) => ({
          // Rotate the lamina about its own base, then move it into the leaf.
          x: baseX + point.x * laminaCos + point.y * laminaSin,
          y: baseY - point.x * laminaSin + point.y * laminaCos,
        }))

        if (local.length < 3) continue
        const points = local.map(place)
        for (const point of points) include(point)
        shapes.push({ role: 'leaf', points, fill: lit ? shadeHex(leafFill, shade) : leafFill })

        // Veins on blades only. A pinnule a few millimetres across has no room
        // for them, and a rachis is a line rather than a blade: drawing veins on
        // one adds tens of thousands of invisible paths to a jacaranda.
        if (lamina.scale < 0.12 || lamina.widthFactor < 0.3) continue
        for (const vein of leafVeins(
          {
            length: drawnLength * lamina.scale,
            width: Math.max(drawnWidth * lamina.scale * lamina.widthFactor, 0.02),
            outline,
            margin,
            venation,
            seed: `${seed}|leaf|${i}|${k}`,
            curve: arch,
          },
          lamina.scale >= 1 ? 26 : 12,
        )) {
          const path = vein.points.map((point: Point) => ({
            x: baseX + point.x * laminaCos + point.y * laminaSin,
            y: baseY - point.x * laminaSin + point.y * laminaCos,
          }))
          if (path.length < 2) continue
          const placed = path.map(place)
          for (const point of placed) include(point)
          shapes.push({
            role: 'leaf',
            points: placed,
            fill: 'none',
            stroke: lit ? shadeHex(veinFill, shade) : veinFill,
            strokeWidth: Math.max(0.015, drawnLength * 0.006 * vein.weight),
            closed: false,
          })
        }
      }
      continue
    }

    // An axial organ: a quad along its own direction, as thick as the pipe
    // model says at this height, and never thinner than it can be drawn.
    const fraction = tallest > 0 ? Math.max(0, Math.min(1, organ.y / tallest)) : 0
    const half = Math.max(taperedRadius(baseRadius, fraction), STEM_FLOOR) / 2
    const length = organ.length * organ.scale
    const tipLocal: Point = { x: 0, y: length }
    const baseLocal: Point = { x: 0, y: 0 }
    const offsetLocal: Point = { x: half, y: 0 }
    const quad = [
      { x: baseLocal.x + offsetLocal.x, y: baseLocal.y + offsetLocal.y },
      { x: tipLocal.x + offsetLocal.x, y: tipLocal.y + offsetLocal.y },
      { x: tipLocal.x - offsetLocal.x, y: tipLocal.y - offsetLocal.y },
      { x: baseLocal.x - offsetLocal.x, y: baseLocal.y - offsetLocal.y },
    ].map(place)
    for (const point of quad) include(point)
    shapes.push({
      role: organ.kind,
      points: quad,
      fill: lit ? shadeHex(stemFill, shade) : stemFill,
    })
  }

  return { shapes, minX, minY, maxX, maxY }
}
