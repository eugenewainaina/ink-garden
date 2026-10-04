/**
 * Integer-only deterministic randomness.
 *
 * Every function here uses 32-bit integer operations exclusively. No
 * Math.sin, no floating-point accumulation. This is deliberate: it makes
 * genomes bit-identical between V8 and JavaScriptCore, so a plant grown on
 * an iPad and the same plant grown in the Node gallery are the same plant.
 * Floating-point divergence is confined to geometry, which is quantised.
 */

/** FNV-1a, returning an unsigned 32-bit integer. */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 seeded from a string hash. Returns r in [0, 1). */
export function rngFrom(seed: string): () => number {
  let a = hash32(seed)
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Pick an index from a weight distribution. Weights need not sum to 1.
 * `r` must be in [0, 1).
 */
export function pickWeighted(weights: readonly number[], r: number): number {
  let total = 0
  for (const w of weights) {
    if (w < 0) throw new Error('pickWeighted: negative weight')
    total += w
  }
  if (total <= 0) throw new Error('pickWeighted: weights sum to zero')

  const target = r * total
  let acc = 0
  for (let i = 0; i < weights.length; i += 1) {
    acc += weights[i] ?? 0
    if (target < acc) return i
  }
  return weights.length - 1
}
