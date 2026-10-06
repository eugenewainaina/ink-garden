import type { Phenotype } from '../phenotype.ts'
import { leafOutline, type Point } from './leaf.ts'
import type { Organ, Structure } from './structure.ts'

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
 * Flat colours for now.
 *
 * Deliberately not wired to the pigment loci yet. The point of this stage is to
 * find out whether the SHAPE reads as a dandelion, and a wrong shape cannot be
 * rescued by the right green. Colour comes after the shape is trustworthy.
 */
const LEAF_FILL = '#5f8a4a'
const STEM_FILL = '#6d5c40'

/** How many points around a lamina. Enough for lobes, cheap for a thousand plants. */
const LAMINA_SAMPLES = 28

/**
 * Turn an organ tree into polygons.
 *
 * The organs already carry absolute positions and in-plane angles from
 * `placeOrgans`, so this only has to give each one a shape and rotate it into
 * place. Leaves get a real lamina; everything axial gets a tapered quad.
 */
export function sceneFromStructure(
  structure: Structure,
  phenotype: Phenotype,
  seed: string,
): Scene {
  const outline = phenotype.discrete['leaf.outline']?.expressed[0] ?? 'elliptic'
  const margin = phenotype.discrete['leaf.margin']?.expressed[0] ?? 'entire'

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

  // A stem thinner than this is invisible, so give it a floor relative to the
  // plant rather than letting a 0.1 unit axis vanish.
  const STEM_FLOOR = Math.max(0.06, structure.height * 0.006)

  const organs = structure.root.children
  for (let i = 0; i < organs.length; i += 1) {
    const organ = organs[i]
    if (organ === undefined) continue
    const radians = (organ.transform.angle * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)

    /** Local to world: rotate by the organ's angle from vertical, then place. */
    const place = (local: Point): Point => ({
      x: organ.transform.x + local.x * cos + local.y * sin,
      y: organ.transform.y - local.x * sin + local.y * cos,
    })

    if (organ.kind === 'leaf') {
      const foreshortening = organ.transform.scale
      const points = leafOutline(
        {
          length: organ.length * foreshortening,
          width: organ.width * foreshortening,
          outline,
          margin,
          seed: `${seed}|leaf|${i}`,
        },
        LAMINA_SAMPLES,
      ).map(place)
      if (points.length < 3) continue
      for (const point of points) include(point)
      shapes.push({ role: 'leaf', points, fill: LEAF_FILL })
      continue
    }

    // An axial organ: a quad along its own direction, with a visible width.
    const half = Math.max(organ.width, STEM_FLOOR) / 2
    const length = organ.length * organ.transform.scale
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
    shapes.push({ role: organ.kind, points: quad, fill: STEM_FILL })
  }

  return { shapes, minX, minY, maxX, maxY }
}
