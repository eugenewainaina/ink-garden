import type { Scene, SceneShape } from '@ink-garden/engine'

/**
 * The canvas adapter.
 *
 * The second renderer, which is the point of the seam: `svg.ts` and this file
 * take the same `Scene` and produce a file and a screen respectively. Neither
 * knows anything about plants.
 *
 * Canvas is the right target for the app and SVG is the right target for a
 * file. A jacaranda is about ten thousand paths, which is 9 MB of markup and
 * fine for a wallpaper, and it is a handful of milliseconds of drawing commands
 * on a screen. Ten thousand `<path>` elements in a browser is not.
 *
 * There is no ink wobble here. The displacement map that fakes a drawn edge in
 * `svg.ts` is an SVG filter and canvas has no equivalent; the paper is drawn
 * instead, and the marks are the shapes the engine produced.
 */

export interface CanvasOptions {
  readonly padding?: number
  readonly background?: string
  readonly zoom?: number
  /** Seeds the paper flecks. */
  readonly seed?: string
  /** Draw the gold-flecked paper. */
  readonly paper?: boolean
  /** Device pixel ratio, so a phone screen is not soft. */
  readonly pixelRatio?: number
  /** Cap on the device pixel ratio, for memory. */
  readonly maxPixelRatio?: number
}

/** A tiny integer generator, matching the one in `svg.ts`. */
function paperRandom(seed: string): () => number {
  let state = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i)
    state = Math.imul(state, 16777619)
  }
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 100000) / 100000
  }
}

/** Anything that can take the subset of the 2D context this uses. */
export interface DrawTarget {
  save(): void
  restore(): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  fill(): void
  stroke(): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  set fillStyle(value: string)
  set strokeStyle(value: string)
  set lineWidth(value: number)
  set lineJoin(value: string)
  set lineCap(value: string)
}

export interface DrawResult {
  readonly width: number
  readonly height: number
}

/**
 * Work out the frame for a scene at a given output size, without drawing.
 *
 * Separated so a caller can size a canvas before it has a context, which is
 * what a browser requires: the element has to be the right size before the
 * first draw or the whole thing is resampled.
 */
export function frameScene(
  scene: Scene,
  options: CanvasOptions = {},
): { readonly width: number; readonly height: number; readonly zoom: number } {
  const padding = options.padding ?? 12
  const zoom = options.zoom ?? 1
  const spanX = Math.max(1e-6, (scene.maxX - scene.minX) * zoom)
  const spanY = Math.max(1e-6, (scene.maxY - scene.minY) * zoom)
  return { width: spanX + padding * 2, height: spanY + padding * 2, zoom }
}

function pathFor(
  target: DrawTarget,
  shape: SceneShape,
  toX: (x: number) => number,
  toY: (y: number) => number,
): void {
  target.beginPath()
  const points = shape.points
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    if (point === undefined) continue
    if (i === 0) target.moveTo(toX(point.x), toY(point.y))
    else target.lineTo(toX(point.x), toY(point.y))
  }
  // An open path, like a vein, must not be closed.
  if (shape.closed !== false) target.closePath()
}

export function drawScene(
  target: DrawTarget,
  scene: Scene,
  options: CanvasOptions = {},
): DrawResult {
  const padding = options.padding ?? 12
  const zoom = options.zoom ?? 1
  const seed = options.seed ?? 'ink-garden'
  const background = options.background ?? '#faf7ef'
  const ratio = Math.max(1, Math.min(options.maxPixelRatio ?? 3, options.pixelRatio ?? 1))

  const framed = frameScene(scene, options)
  const width = framed.width
  const height = framed.height

  // Plants grow upward and screens grow downward, so y flips here and only here.
  const toX = (x: number): number => (x - scene.minX) * zoom + padding
  const toY = (y: number): number =>
    (height - padding - (y - scene.minY) * zoom) * ratio

  target.save()
  target.fillStyle = background
  target.beginPath()
  target.moveTo(0, 0)
  target.lineTo(width * ratio, 0)
  target.lineTo(width * ratio, height * ratio)
  target.lineTo(0, height * ratio)
  target.closePath()
  target.fill()

  if (options.paper !== false) {
    // Gold flecks at about half a per cent of the area, drawn small. The same
    // density the vector paper uses, so the two renderers agree on what the
    // stock looks like.
    const random = paperRandom(seed)
    const count = Math.round(((width * height) / (140 * 140)) * 92)
    for (let i = 0; i < count; i += 1) {
      const x = random() * width * ratio
      const y = random() * height * ratio
      const radius = (0.18 + random() * 0.45) * ratio
      const shade = 0.55 + random() * 0.35
      target.fillStyle = `rgba(${Math.round(200 * shade)},${Math.round(150 * shade)},${Math.round(70 * shade)},${(0.5 + random() * 0.5).toFixed(2)})`
      target.beginPath()
      target.arc(x, y, radius, 0, Math.PI * 2)
      target.closePath()
      target.fill()
    }
  }

  target.lineJoin = 'round'
  target.lineCap = 'round'
  for (const shape of scene.shapes) {
    pathFor(target, shape, (x) => toX(x) * ratio, toY)
    if (shape.fill !== 'none') {
      target.fillStyle = shape.fill
      target.fill()
    }
    if (shape.stroke !== undefined) {
      target.strokeStyle = shape.stroke
      target.lineWidth = (shape.strokeWidth ?? 0.05) * zoom * ratio
      target.stroke()
    }
  }

  target.restore()
  return { width, height }
}
