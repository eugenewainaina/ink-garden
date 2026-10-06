import type { Scene, SceneShape } from '@ink-garden/engine'

/**
 * Serialise a scene to SVG.
 *
 * Deliberately thin. The engine decided the shape; this decides only how a
 * shape becomes text in one particular format. A canvas adapter would slot in
 * beside it without touching the engine, which is what makes this a seam rather
 * than a wrapper.
 */

export interface SvgOptions {
  /** Padding around the drawing, in user units. */
  readonly padding?: number
  readonly background?: string
  /** Extra scale applied before framing. */
  readonly zoom?: number
}

function pathFor(shape: SceneShape, toX: (x: number) => number, toY: (y: number) => number): string {
  const parts: string[] = []
  for (let i = 0; i < shape.points.length; i += 1) {
    const point = shape.points[i]
    if (point === undefined) continue
    parts.push(`${i === 0 ? 'M' : 'L'}${toX(point.x).toFixed(2)},${toY(point.y).toFixed(2)}`)
  }
  // An open path, like a vein, must not be closed.
  const close = shape.closed === false ? '' : ' Z'
  return `${parts.join(' ')}${close}`
}

/** The drawing without any wrapper, plus the size it wants. */
export interface Rendered {
  readonly body: string
  readonly width: number
  readonly height: number
  readonly toX: (x: number) => number
  readonly toY: (y: number) => number
}

export function renderScene(scene: Scene, options: SvgOptions = {}): Rendered {
  const padding = options.padding ?? 12
  const zoom = options.zoom ?? 1

  const spanX = Math.max(1e-6, (scene.maxX - scene.minX) * zoom)
  const spanY = Math.max(1e-6, (scene.maxY - scene.minY) * zoom)
  const width = spanX + padding * 2
  const height = spanY + padding * 2

  // Plants grow upward and SVG grows downward, so y is flipped here and
  // nowhere else.
  const toX = (x: number): number => (x - scene.minX) * zoom + padding
  const toY = (y: number): number => height - padding - (y - scene.minY) * zoom

  const body = scene.shapes
    .map((shape) => {
      const edge =
        shape.stroke === undefined
          ? ''
          : ` stroke="${shape.stroke}" stroke-width="${(shape.strokeWidth ?? 0.05) * zoom}" stroke-linejoin="round" stroke-linecap="round"`
      return `<path d="${pathFor(shape, toX, toY)}" fill="${shape.fill}"${edge}/>`
    })
    .join('\n')

  return { body, width, height, toX, toY }
}

export function toSvg(scene: Scene, options: SvgOptions = {}): string {
  const rendered = renderScene(scene, options)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${rendered.width.toFixed(1)}" height="${rendered.height.toFixed(1)}" viewBox="0 0 ${rendered.width.toFixed(1)} ${rendered.height.toFixed(1)}">
<rect width="${rendered.width.toFixed(1)}" height="${rendered.height.toFixed(1)}" fill="${options.background ?? '#faf7ef'}"/>
${rendered.body}
</svg>
`
}
