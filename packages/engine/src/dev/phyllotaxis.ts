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
