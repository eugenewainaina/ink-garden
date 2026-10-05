/**
 * Solar geometry. Pure, offline, no network. This is the lighting backbone and
 * also what photoperiod responds to, which is why it lives in the engine rather
 * than in the renderer (spec §7.1).
 *
 * Uses Cooper's equation for declination, which is accurate to about a degree
 * and is more than enough for a garden. Verified against real daylengths for
 * Glasgow and Nairobi in the tests.
 */

const DEG = Math.PI / 180

/** Solar declination in degrees, for a day of year 1..365. */
export function solarDeclinationDeg(dayOfYear: number): number {
  return 23.44 * Math.sin(360 * ((284 + dayOfYear) / 365) * DEG)
}

/**
 * The zenith angle at which the sun is taken to be up.
 *
 * Not 90 degrees. Sunrise is when the upper limb appears, and the atmosphere
 * refracts it upward by about half a degree, so the standard figure is 90.833.
 * Using a flat 90 makes every day length about 15 to 20 minutes short at
 * mid-latitudes, which is a systematic error rather than noise.
 */
const SUNRISE_ZENITH_DEG = 90.833

/**
 * Daylength in hours. Clamped for polar day and night, and the latitude is
 * clamped just inside the poles, where the tangent is undefined.
 */
export function dayLengthHours(dayOfYear: number, latitudeDeg: number): number {
  const lat = Math.max(-89.999, Math.min(89.999, latitudeDeg)) * DEG
  const dec = solarDeclinationDeg(dayOfYear) * DEG
  const denominator = Math.cos(lat) * Math.cos(dec)
  if (denominator === 0) return 12
  const cosHourAngle =
    (Math.cos(SUNRISE_ZENITH_DEG * DEG) - Math.sin(lat) * Math.sin(dec)) / denominator
  if (cosHourAngle <= -1) return 24
  if (cosHourAngle >= 1) return 0
  const hourAngleDeg = Math.acos(cosHourAngle) / DEG
  return (2 * hourAngleDeg) / 15
}

/** Sunrise and sunset as hours after local solar midnight. */
export function sunTimes(
  dayOfYear: number,
  latitudeDeg: number,
): { readonly sunrise: number; readonly sunset: number } {
  const length = dayLengthHours(dayOfYear, latitudeDeg)
  const sunrise = 12 - length / 2
  return { sunrise, sunset: sunrise + length }
}

/** Solar altitude in degrees at a given hour, for lighting. */
export function solarAltitudeDeg(
  dayOfYear: number,
  latitudeDeg: number,
  hour: number,
): number {
  const lat = latitudeDeg * DEG
  const dec = solarDeclinationDeg(dayOfYear) * DEG
  const hourAngle = (hour - 12) * 15 * DEG
  const sinAltitude =
    Math.sin(lat) * Math.sin(dec) +
    Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)
  return Math.asin(Math.max(-1, Math.min(1, sinAltitude))) / DEG
}
