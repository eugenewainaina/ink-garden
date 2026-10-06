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
  /**
   * Draw it as ink on paper.
   *
   * Everything stays vector: the grain is an SVG turbulence filter, the flecks
   * are a tiled pattern, and the wobble on every edge is a displacement map. A
   * filter is how an ink drawing is faked in a vector format, and it keeps the
   * output resolution-independent, which a raster texture would not.
   */
  readonly ink?: boolean
  /** Seeds the paper; the same seed gives the same sheet. */
  readonly seed?: string
  /**
   * Decimal places in the output coordinates.
   *
   * A number is most of a path's bytes, so this is the cheapest size lever
   * there is. Two places is right for a wallpaper; at thumbnail size a tenth of
   * a user unit is already smaller than a pixel and the extra digit is paid for
   * and never seen.
   */
  readonly precision?: number
}

/** A small integer generator, so the paper is reproducible without a dependency. */
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

/**
 * A tiled, gold-flecked ground.
 *
 * A tiled pattern rather than thousands of individual flecks, because flecks
 * are a texture and a texture that repeats is what paper does. About half a per
 * cent of the area is a warm brown, which is what makes the ground read as
 * handmade paper rather than as a flat colour.
 */
function paperDefs(seed: string): string {
  const random = paperRandom(seed)
  const tile = 140
  // About half a per cent of the area, at the size the reference uses. The
  // first attempt drew twenty-two flecks at a radius of up to 1.8, which at
  // drawing scale is a field of large dots rather than a flecked paper: flecks
  // have to be numerous and tiny or the eye reads them as objects.
  const flecks: string[] = []
  for (let i = 0; i < 92; i += 1) {
    const x = (random() * tile).toFixed(1)
    const y = (random() * tile).toFixed(1)
    const r = (0.18 + random() * 0.45).toFixed(2)
    const shade = 0.55 + random() * 0.35
    flecks.push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="rgb(${Math.round(200 * shade)},${Math.round(150 * shade)},${Math.round(70 * shade)})" opacity="${(0.5 + random() * 0.5).toFixed(2)}"/>`,
    )
  }
  return `<pattern id="dsh-flecks" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse">${flecks.join('')}</pattern>
<filter id="dsh-grain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" result="n"/>
  <feColorMatrix in="n" type="saturate" values="0" result="g"/>
  <feComponentTransfer in="g" result="speckle">
    <feFuncA type="linear" slope="0.22" intercept="0"/>
  </feComponentTransfer>
  <feComposite in="speckle" in2="SourceGraphic" operator="over"/>
</filter>
<filter id="dsh-ink" x="-6%" y="-6%" width="112%" height="112%">
  <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="warp"/>
  <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.6" xChannelSelector="R" yChannelSelector="G"/>
</filter>`
}

function pathFor(
  shape: SceneShape,
  toX: (x: number) => number,
  toY: (y: number) => number,
  precision: number,
): string {
  const parts: string[] = []
  for (let i = 0; i < shape.points.length; i += 1) {
    const point = shape.points[i]
    if (point === undefined) continue
    parts.push(
      `${i === 0 ? 'M' : 'L'}${toX(point.x).toFixed(precision)},${toY(point.y).toFixed(precision)}`,
    )
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
  const precision = Math.max(0, Math.min(3, options.precision ?? 2))

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
      return `<path d="${pathFor(shape, toX, toY, precision)}" fill="${shape.fill}"${edge}/>`
    })
    .join('\n')

  return { body, width, height, toX, toY }
}

export function toSvg(scene: Scene, options: SvgOptions = {}): string {
  const rendered = renderScene(scene, options)
  const width = rendered.width.toFixed(1)
  const height = rendered.height.toFixed(1)
  const background = options.background ?? '#faf7ef'

  if (!options.ink) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${background}"/>
${rendered.body}
</svg>
`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${paperDefs(options.seed ?? 'ink-garden')}</defs>
<rect width="${width}" height="${height}" fill="${background}"/>
<rect width="${width}" height="${height}" fill="url(#dsh-flecks)" filter="url(#dsh-grain)"/>
<g filter="url(#dsh-ink)">
${rendered.body}
</g>
</svg>
`
}
