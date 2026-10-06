import { normalisedTrait, type Phenotype } from '../phenotype.ts'
import type { SpeciesTemplate } from '../species.ts'
import { LEAF_OUTLINES, leafOutline, type Point } from './leaf.ts'
import type { ProjectedOrgan } from './layout.ts'
import { POINTED_TAPER, ellipse, taperedStroke } from './stroke.ts'

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
  /** Filaments, style and stigma: the reproductive organs. */
  readonly organ: string
  /** Anthers and the stigma tip, which are usually a different colour. */
  readonly anther: string
  /** The calyx, behind the corolla. Green, or a darker shade of the flower. */
  readonly calyx: string
  /** A ripe achene body: cream to greenish brown. */
  readonly seed: string
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
  stage: 'bud' | 'bloom' | 'seed' = 'bloom',
): readonly { readonly points: readonly Point[]; readonly fill: string }[] {
  const petals = Math.max(1, Math.round(phenotype.quantitative['petal.count'] ?? 5))
  const shapeTerm = phenotype.discrete['petal.shape']?.expressed[0] ?? 'rounded'
  const marginTerm = phenotype.discrete['petal.margin']?.expressed[0] ?? 'entire'
  // A capitulum's florets are LIGULES: strap-shaped, parallel-sided, ending in
  // a flat toothed tip. The `linear` outline tapers to a point at both ends, so
  // a dandelion drawn with it came out as a sea urchin. Spatulate is widest
  // near the tip, which is the strap.
  const margin = PETAL_MARGIN[marginTerm] ?? 'entire'

  const isHead = inflorescence === 'head'
  const outline = isHead ? 'spatulate' : (PETAL_OUTLINE[shapeTerm] ?? 'obovate')
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
  const petalWidth = (petalLength * (isHead ? 0.42 : 0.55)) / Math.max(0.1, aspect)

  const out: { points: readonly Point[]; fill: string }[] = []
  const centre = { x: organ.x, y: organ.y }

  // ---- A bud ----
  //
  // A bud is the calyx closed over a corolla that has not expanded: a green
  // ovoid with the folded petals showing as a tip at the end. No stamens and no
  // stigma are visible, because in a real bud they are still inside. The bud
  // points along +y, which in the flower's own frame is where the stem brings
  // it from.
  if (stage === 'bud') {
    const width = Math.max(0.04, petalLength * 0.34)
    const height = Math.max(0.06, petalLength * 0.62)
    // The calyx, closed.
    const body: Point[] = []
    for (let i = 0; i < 14; i += 1) {
      const radians = (i * 2 * Math.PI) / 14
      body.push({
        x: centre.x + width * Math.cos(radians),
        y: centre.y + petalLength * 0.2 + height * Math.sin(radians),
      })
    }
    out.push({ points: body, fill: colours.calyx })

    // The folded corolla, showing at the tip.
    const tipWidth = width * 0.62
    const tip: Point[] = []
    for (let i = 0; i < 12; i += 1) {
      const radians = (i * 2 * Math.PI) / 12
      tip.push({
        x: centre.x + tipWidth * Math.cos(radians),
        y: centre.y + petalLength * 0.2 + height * 0.92 + height * 0.3 * Math.sin(radians),
      })
    }
    out.push({ points: tip, fill: colours.petal })
    return out
  }

  // `petal.count` is a phenotype trait capped for drawing: a head can carry
  // hundreds of florets and drawing every one of them at this scale adds
  // nothing a hundred does not.
  // A capitulum reads as a disc because its ligules overlap heavily. Drawn as
  // thin spikes that barely touch, a dandelion looks like a sea urchin, which
  // is exactly what the first flower close-up showed.
  const drawn = Math.max(1, Math.min(isHead ? 96 : 12, petals))
  const phase = (seed.length * 37) % 360

  // ---- The seed head ----
  //
  // The Flora of New Zealand gives a dandelion's achene body as clavate and 2.5
  // to 3.5 mm, its cone half a millimetre, its beak a slender white 7 to 10 mm,
  // and its pappus a white 5 to 7 mm. So a seed runs to about 15 to 21 mm from
  // base to pappus tip, which is very nearly the radius of the capitulum it
  // replaces: the clock is the same size as the flower was.
  //
  // Drawn as a globe of achenes, because that is what it is. Each one is a body,
  // a long beak, and a parachute.
  if (stage === 'seed') {
    const seeds = Math.max(8, Math.min(48, Math.round(petals * 0.7)))
    const phase1 = phase + 180 / seeds
    for (let i = 0; i < seeds; i += 1) {
      const angle = phase1 + (i * 360) / seeds
      const radians = (angle * Math.PI) / 180
      const outward = { x: Math.sin(radians), y: Math.cos(radians) }
      const at = (fraction: number): Point => ({
        x: centre.x + outward.x * petalLength * fraction,
        y: centre.y + outward.y * petalLength * fraction,
      })

      // The achene body, clavate: narrow at the base, broadening upward.
      const bodyBase = at(0.1)
      const bodyTop = at(0.28)
      const body = leafOutline(
        {
          length: petalLength * 0.2,
          width: Math.max(0.02, petalLength * 0.07),
          outline: 'spatulate',
          margin: 'entire',
          seed: `${seed}|achene|${i}`,
          curve: 0,
        },
        7,
      ).map((point: Point) => ({
        x: bodyBase.x + point.x * Math.cos(radians) + point.y * outward.x,
        y: bodyBase.y - point.x * Math.sin(radians) + point.y * outward.y,
      }))
      if (body.length >= 3) out.push({ points: body, fill: colours.seed })

      // The beak, slender and long: seven to ten millimetres against a body of
      // three, which is why it reads as a stalk rather than as part of the seed.
      const beak = taperedStroke(
        [bodyTop, at(0.5), at(0.72)],
        POINTED_TAPER,
        Math.max(0.008, petalLength * 0.018),
      )
      if (beak.length >= 3) out.push({ points: beak, fill: colours.organ })

      // The pappus: a parachute of hairs, which is what carries the seed.
      const hairs = 7
      for (let h = 0; h < hairs; h += 1) {
        const spread = (h / (hairs - 1) - 0.5) * 0.9
        const from = at(0.72)
        const tip = {
          x: centre.x + outward.x * petalLength + Math.cos(radians) * spread * petalLength * 0.34,
          y: centre.y + outward.y * petalLength - Math.sin(radians) * spread * petalLength * 0.34,
        }
        const hair = taperedStroke([from, tip], POINTED_TAPER, Math.max(0.006, petalLength * 0.012))
        if (hair.length >= 3) out.push({ points: hair, fill: colours.organ })
      }
    }
    return out
  }

  // ---- The calyx, behind everything ----
  //
  // The outermost whorl, and the first thing a bud shows. Every one of these
  // species has one: rosemary's is purplish and downy, jacaranda's is
  // narrow-campanulate, a mint's is five toothed, and a dandelion's involucre
  // is the same cup of bracts beneath the head. Drawn first so the corolla
  // covers its base, which is how a calyx sits.
  const sepalCount = Math.max(2, Math.round(5 + normalisedTrait(phenotype, 'sepal.count') * 8))
  const sepalFraction = 0.18 + normalisedTrait(phenotype, 'sepal.length') * 0.34
  const sepalLength = petalLength * sepalFraction
  const sepals = isHead ? Math.min(sepalCount, 16) : Math.min(sepalCount, 8)

  // A calyx is a CUP first and a set of lobes second. Bean's gives rosemary a
  // calyx that is "darker and purplish" but does not call it five free sepals;
  // PlantNET calls jacaranda's "narrow-campanulate", a bell; a mint's is five
  // TOOTHED, meaning a tube with teeth. Drawing free sepals radiating outward
  // put black spikes between the petals on all three, which is not a calyx.
  // On a HEAD the cup is not a calyx at all: it is the involucre, and it sits
  // BENEATH the capitulum as the cup the florets stand in. Drawn at the centre
  // it filled the disc with a green star, which is not what an involucre is.
  const cupCentre = isHead
    ? { x: centre.x, y: centre.y - petalLength * 0.42 }
    : centre
  const cupRadius = isHead ? petalLength * 0.62 : sepalLength * 0.78
  const cup = ellipse(cupCentre, cupRadius, cupRadius * (isHead ? 0.5 : 0.77), 14)
  out.push({ points: cup, fill: colours.calyx })

  const phase0 = phase + 180 / sepals
  for (let i = 0; i < sepals; i += 1) {
    const radians = ((phase0 + (i * 360) / sepals) * Math.PI) / 180
    const outward = { x: Math.sin(radians), y: Math.cos(radians) }
    // The lobes are short teeth at the rim of the cup, which is what shows
    // beyond the corolla on a mint and what a bud is closed by.
    const lobeLength = isHead ? petalLength * 0.5 : sepalLength * 0.85
    const lobe = leafOutline(
      {
        length: lobeLength,
        width: Math.max(0.015, lobeLength * (isHead ? 0.34 : 0.3)),
        outline: 'lanceolate',
        margin: 'entire',
        seed: `${seed}|sepal|${i}`,
        curve: 0.5,
      },
      6,
    ).map((point: Point) => ({
      // On a head the bracts splay out and down from the base of the cup.
      x: cupCentre.x + outward.x * lobeLength * 0.42 + point.x * Math.cos(radians) + point.y * outward.x,
      y:
        cupCentre.y +
        outward.y * lobeLength * 0.28 -
        point.x * Math.sin(radians) +
        point.y * outward.y,
    }))
    if (lobe.length >= 3) out.push({ points: lobe, fill: colours.calyx })
  }

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
        curve: isHead ? 0.1 : 0.4,
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

  // ---- The androecium and the gynoecium ----
  //
  // A flower with no stamens is not a complete flower, and in two of these
  // species the stamens are the obvious thing about it: a rosemary's protrude
  // well past the corolla, and a mint has four. They were missing entirely
  // until the genome grew the loci for them.
  // NORMALISED, not raw. A quantitative trait's stored value runs to the sum of
  // its loci weights, which is 1.64 for stamen count, so using it directly gave
  // a dandelion nine stamens where five is the family's number.
  const stamens = Math.max(1, Math.round(2 + normalisedTrait(phenotype, 'stamen.count') * 4))
  const exserted = (phenotype.discrete['stamen.exsertion']?.expressed[0] ?? 'included') === 'exserted'
  const drawnStamens = Math.min(stamens, 8)

  // Inside the corolla the reproductive column is short; outside it, it reaches
  // past the petals, which is the whole visual difference between a rosemary
  // and a jacaranda.
  const organLength = petalLength * (exserted ? 1.05 : 0.6)
  const organBase = { x: centre.x, y: centre.y }
  const phase2 = phase + 30

  for (let i = 0; i < drawnStamens; i += 1) {
    const angle = phase2 + (i * 360) / drawnStamens
    const radians = (angle * Math.PI) / 180
    // The filament reaches, and the stamens SPLAY around the style rather than
    // standing in a column. The first version varied only the horizontal term
    // and pushed every tip up the vertical axis, which drew a rosemary's two
    // stamens as one stack above the flower instead of a pair around the
    // stigma. Radial in both terms is what a whorl of stamens is.
    const tip = {
      x: organBase.x + Math.sin(radians) * organLength * 0.72,
      y: organBase.y + Math.cos(radians) * organLength * 0.72 + organLength * 0.28,
    }
    const centreline = [organBase, { x: (organBase.x + tip.x) / 2, y: (organBase.y + tip.y) / 2 }, tip]
    // a filament is a thin tapered stroke
    const filament = taperedStroke(centreline, POINTED_TAPER, Math.max(0.015, petalLength * 0.045))
    if (filament.length >= 3) out.push({ points: filament, fill: colours.organ })

    // the anther is a small body at the tip
    const anther = ellipse(tip, Math.max(0.02, petalLength * 0.075), Math.max(0.02, petalLength * 0.05), 8)
    out.push({ points: anther, fill: colours.anther })
  }

  // The style is a single column, usually longer than the stamens, since its
  // job is to catch pollen rather than to shed it.
  // A style is normally about as long as the stamens it stands among: its job
  // is to catch pollen off them, not to tower over them. It is allowed a little
  // more when exserted, which is when a stigma is held clear of the anthers.
  const styleFraction = Math.max(0.35, Math.min(1.2, 0.55 + normalisedTrait(phenotype, 'carpel.style') * 0.6))
  // Just clear of the anthers when exserted, well inside the corolla when not.
  const styleLength = organLength * styleFraction * 0.92
  const styleCentre = [
    organBase,
    { x: centre.x, y: centre.y + styleLength * 0.5 },
    { x: centre.x, y: centre.y + styleLength },
  ]
  const style = taperedStroke(styleCentre, POINTED_TAPER, Math.max(0.02, petalLength * 0.055))
  if (style.length >= 3) out.push({ points: style, fill: colours.organ })
  const stigma = ellipse(
    { x: centre.x, y: centre.y + styleLength },
    Math.max(0.03, petalLength * 0.1),
    Math.max(0.02, petalLength * 0.055),
    8,
  )
  out.push({ points: stigma, fill: colours.anther })

  return out
}
