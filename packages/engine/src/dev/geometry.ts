import type { Phenotype } from '../phenotype.ts'
import type { SpeciesTemplate } from '../species.ts'
import { leafDecomposition, leafOutline, type Point } from './leaf.ts'
import { DEFAULT_TILT_DEG, placeOrgans, projectOrgans } from './layout.ts'
import { growthFormOf } from './shoot.ts'
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
  const outline = phenotype.discrete['leaf.outline']?.expressed[0] ?? 'elliptic'
  const margin = phenotype.discrete['leaf.margin']?.expressed[0] ?? 'entire'
  const leafForm = phenotype.discrete['leaf.form']?.expressed[0] ?? 'simple'
  const laminae = leafDecomposition(leafForm)

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

  // A stem thinner than this is invisible, so give it a floor relative to the
  // plant rather than letting a 0.1 unit axis vanish.
  let tallest = 0
  for (const organ of organs) {
    const tip = organ.y + organ.length * organ.scale * Math.cos((organ.angle * Math.PI) / 180)
    if (tip > tallest) tallest = tip
  }
  const STEM_FLOOR = Math.max(0.06, tallest * 0.006)
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
        shapes.push({ role: 'leaf', points, fill: leafFill })
      }
      continue
    }

    // An axial organ: a quad along its own direction, with a visible width.
    const half = Math.max(organ.width, STEM_FLOOR) / 2
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
    shapes.push({ role: organ.kind, points: quad, fill: stemFill })
  }

  return { shapes, minX, minY, maxX, maxY }
}
