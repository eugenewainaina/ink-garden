const DEG_TO_RAD = Math.PI / 180

export type Phyllotaxis = 'alternate' | 'decussate' | 'whorled' | 'spiral'

/** The golden angle, 360 * (1 - 1/phi). The reason plants look like plants. */
export const GOLDEN_ANGLE = 360 * (1 - 1 / ((1 + Math.sqrt(5)) / 2))

export function phyllotaxisAngle(pattern: Phyllotaxis): number {
  switch (pattern) {
    case 'alternate':
      return 180
    case 'decussate':
      return 90
    case 'whorled':
      return 120
    case 'spiral':
    default:
      return GOLDEN_ANGLE
  }
}

/** How many leaves emerge at each node. */
export function leavesPerNode(pattern: Phyllotaxis): number {
  switch (pattern) {
    case 'decussate':
      return 2
    case 'whorled':
      return 3
    default:
      return 1
  }
}

/**
 * The azimuth of the first leaf at a node: its rotation *around* the stem, in
 * degrees.
 *
 * This is emphatically not the angle a renderer draws the leaf at. An azimuth
 * is a rotation around an axis; a drawing needs a direction in the picture
 * plane. Confusing the two put every leaf collinear with the stem, because
 * alternate phyllotaxis gives azimuths of 0 and 180, and a leaf drawn at 0
 * degrees from vertical points straight up the stem. Use `projectLeaf` for
 * drawing.
 */
export function nextBudAngle(pattern: Phyllotaxis, nodeIndex: number): number {
  const raw = nodeIndex * phyllotaxisAngle(pattern)
  return ((raw % 360) + 360) % 360
}

/** How far a leaf stands out from the stem, in degrees. */
export const LEAF_DIVERGENCE_DEG = 55

/** A direction in three dimensions: x right, y up, z toward the viewer. */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * The unit direction of a leaf in three dimensions.
 *
 * A leaf attaches at `divergence` degrees from the stem axis and points radially
 * at its azimuth. This is the honest form of the geometry: the earlier version
 * collapsed it to two dimensions immediately, which threw away the depth that
 * makes a rosette legible, because a rosette seen edge-on is a squashed mound.
 */
export function leafDirection3(
  azimuthDeg: number,
  divergenceDeg = LEAF_DIVERGENCE_DEG,
): Vec3 {
  const azimuth = azimuthDeg * DEG_TO_RAD
  const divergence = divergenceDeg * DEG_TO_RAD
  const radial = Math.sin(divergence)
  return {
    x: radial * Math.cos(azimuth),
    y: Math.cos(divergence),
    z: radial * Math.sin(azimuth),
  }
}

/**
 * Lean a direction in the picture plane, by a shoot that is not vertical.
 *
 * Rotating "from vertical, anticlockwise" has to send (0,1,0) to
 * (sin a, cos a, 0), which is the convention the renderer expects.
 */
export function leanInPicture(v: Vec3, degrees: number): Vec3 {
  const a = degrees * DEG_TO_RAD
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z }
}

/** The direction straight up: an erect stem's axis. */
export const UP: Vec3 = { x: 0, y: 1, z: 0 }

/**
 * How much of a direction's length survives projection, and at what angle.
 *
 * An orthographic camera tilted down by `tiltDeg`: vertical drops by cos and
 * depth rises by sin, so a leaf lying flat and pointing at the viewer moves up
 * the picture instead of vanishing. At a tilt of zero this is the flat side
 * elevation the silhouette used, which is why that still works.
 */
export function projectDir(
  v: Vec3,
  tiltDeg = 0,
): { readonly angle: number; readonly scale: number } {
  const tilt = tiltDeg * DEG_TO_RAD
  const px = v.x
  const py = v.y * Math.cos(tilt) + v.z * Math.sin(tilt)
  return { angle: Math.atan2(px, py) / DEG_TO_RAD, scale: Math.hypot(px, py) }
}

/** Project a point the same way, so positions and directions agree. */
export function projectPoint(
  p: Vec3,
  tiltDeg = 0,
): { readonly x: number; readonly y: number } {
  const tilt = tiltDeg * DEG_TO_RAD
  return { x: p.x, y: p.y * Math.cos(tilt) + p.z * Math.sin(tilt) }
}

/**
 * Project a leaf's position around the stem onto the picture plane.
 *
 * A leaf attaches at `divergence` degrees from the stem axis and points in the
 * radial direction given by its azimuth. Viewed from the side, that direction
 * has an in-plane component `sin(divergence) * cos(azimuth)` horizontally and
 * `cos(divergence)` vertically, so:
 *
 *   - a leaf at azimuth 0 points clear of the stem and is drawn full length
 *   - a leaf at azimuth 180 points the other way, giving the ladder an
 *     alternate-leaved plant actually has
 *   - a leaf at azimuth 90 points at the viewer, foreshortens to `cos(divergence)`
 *     of its length, and is drawn nearly parallel to the stem
 *
 * The foreshortening is returned as a scale rather than baked into the length,
 * so the organ keeps its true size and only its projection is shortened.
 */
export function projectLeaf(
  azimuthDeg: number,
  divergenceDeg = LEAF_DIVERGENCE_DEG,
): { readonly angle: number; readonly scale: number } {
  const azimuth = azimuthDeg * DEG_TO_RAD
  const divergence = divergenceDeg * DEG_TO_RAD
  const dx = Math.sin(divergence) * Math.cos(azimuth)
  const dy = Math.cos(divergence)
  return {
    angle: Math.atan2(dx, dy) / DEG_TO_RAD,
    scale: Math.hypot(dx, dy),
  }
}
