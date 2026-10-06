import type { Phenotype } from '../phenotype.ts'
import type { SpeciesTemplate } from '../species.ts'
import { LEAF_OUTLINES, leafOutline, type Point } from './leaf.ts'
import type { ProjectedOrgan } from './layout.ts'

/**
 * Flower geometry.
 *
 * The genome already decides petal number, shape, margin, symmetry, colour and
 * inflorescence type, and `identity.ts` already resolves which whorl becomes
 * what. This only has to draw it.
 *
 * Petals are laminae, so they reuse the leaf outline: a petal is a small blade
 * with its own shape and margin, and the botanical terms for the two are the
 * same kind of term. That is not a shortcut, it is what a petal is.
 */

/** Petal shape terms mapped onto lamina outlines. */
const PETAL_OUTLINE: Readonly<Record<string, string>> = {
  rounded: 'orbicular',
  obovate: 'obovate',
  spatulate: 'spatulate',
  // A ligule is a strap: long, narrow, parallel-sided.
  ligulate: 'linear',
  // Clawed is a narrow base widening to a limb, which is what spatulate is.
  clawed: 'spatulate',
}

/** Petal margin terms mapped onto lamina margins. */
const PETAL_MARGIN: Readonly<Record<string, string>> = {
  entire: 'entire',
  ruffled: 'crenate',
  fringed: 'serrate',
  // A notched apex is a small indentation, which dentate approximates at this
  // scale better than any deeper term would.
  notched: 'dentate',
}

export interface FlowerColours {
  readonly petal: string
  readonly centre: string
}

/**
 * Draw one flower or head, in the flower's own coordinates.
 *
 * A HEAD is not a flower with many petals; it is an inflorescence of many
 * small florets, which is why a dandelion's "petal count" runs to fifty or
 * more and why a daisy looks like a disc rather than a ring. It is drawn as a
 * disc of strap florets radiating from a centre. Everything else is a corolla
 * of petals around a small throat.
 */
export function flowerShapes(
  organ: ProjectedOrgan,
  phenotype: Phenotype,
  inflorescence: string,
  colours: FlowerColours,
  seed: string,
): readonly { readonly points: readonly Point[]; readonly fill: string }[] {
  const petals = Math.max(1, Math.round(phenotype.quantitative['petal.count'] ?? 5))
  const shapeTerm = phenotype.discrete['petal.shape']?.expressed[0] ?? 'rounded'
  const marginTerm = phenotype.discrete['petal.margin']?.expressed[0] ?? 'entire'
  const outline = PETAL_OUTLINE[shapeTerm] ?? 'obovate'
  const margin = PETAL_MARGIN[marginTerm] ?? 'entire'

  const isHead = inflorescence === 'head'
  // A mint's corolla really is 2.5 mm, which on a 20 cm plant is a pixel. The
  // model keeps the true size and the DRAWING floors it, so a small flower
  // reads without the species lying about its dimensions.
  // A corolla's petals run from the centre outwards, so half the flower's
  // diameter is the petal length. A head's florets do the same, from a disc.
  const diameter = Math.max(organ.length, 0.6)
  const petalLength = Math.max(0.05, diameter / 2)
  // The outline term narrows a lamina by its own aspect, which is right for a
  // leaf and wrong for a corolla lobe: a mint's petals are small rounded lobes,
  // and applying the strap aspect of `ligulate` twice made them needles a pixel
  // wide. The lobe width is therefore set here and the term's aspect is undone.
  const aspect = LEAF_OUTLINES[outline]?.aspect ?? 1
  const petalWidth = (petalLength * (isHead ? 0.16 : 0.55)) / Math.max(0.1, aspect)

  const out: { points: readonly Point[]; fill: string }[] = []
  const centre = { x: organ.x, y: organ.y }

  // `petal.count` is a phenotype trait capped for drawing: a head can carry
  // hundreds of florets and drawing every one of them at this scale adds
  // nothing a hundred does not.
  const drawn = Math.max(1, Math.min(isHead ? 64 : 12, petals))
  const phase = (seed.length * 37) % 360

  for (let i = 0; i < drawn; i += 1) {
    // A corolla is symmetric about the flower's axis; a head's florets all
    // point outward from the disc with no gap at the centre.
    const angle = phase + (i * 360) / drawn
    const radians = (angle * Math.PI) / 180
    const outward = { x: Math.sin(radians), y: Math.cos(radians) }

    // A petal starts just off centre and runs outwards; a floret starts at the
    // centre of the disc.
    const inset = isHead ? 0 : petalLength * 0.12
    const base = {
      x: centre.x + outward.x * inset,
      y: centre.y + outward.y * inset,
    }
    const local = leafOutline(
      {
        length: petalLength,
        width: petalWidth,
        outline,
        margin,
        seed: `${seed}|petal|${i}`,
        // A petal curls; a ligule is flat.
        curve: isHead ? 0.12 : 0.4,
      },
      14,
    ).map((point: Point) => ({
      // The lamina is built along +y, so rotate it to point outward.
      x: base.x + point.x * Math.cos(radians) + point.y * outward.x,
      y: base.y - point.x * Math.sin(radians) + point.y * outward.y,
    }))

    if (local.length >= 3) out.push({ points: local, fill: colours.petal })
  }

  // The centre of a head is the disc of florets, which reads darker.
  if (isHead) {
    const radius = petalLength * 0.22
    const disc: Point[] = []
    for (let i = 0; i < 10; i += 1) {
      const radians = (i * 36 * Math.PI) / 180
      disc.push({
        x: centre.x + radius * Math.cos(radians),
        y: centre.y + radius * Math.sin(radians),
      })
    }
    out.push({ points: disc, fill: colours.centre })
  }

  return out
}
