# Research note: how `nonflowers` achieves its look

**Date:** 2026-10-03
**Purpose:** inform M0c, so the rendering work starts from a known technique
rather than from iteration in the dark.
**Source:** `main.js` from [LingDong-/nonflowers](https://github.com/LingDong-/nonflowers), MIT,
1,344 lines, the entire engine in one file. Read directly rather than from the
writeup, because the source is unambiguous.

This note records **techniques to adopt** and, more usefully, **things not to
copy and why**. It is not a port plan.

---

## Adopt

### 1. A stroke is a filled polygon, not `ctx.stroke()`

`tubify({ pts, wid })` walks a polyline, computes a normal at each point (the
bisector of the incoming and outgoing directions, ±90°), and emits two vertex
lists offset by `+w(t)` and `-w(t)`. `stroke()` then closes those two lists into
one polygon and fills it.

This is the single most important technique. Canvas's own `stroke()` cannot vary
width along a path, and variable width is most of what makes a mark read as a
brush stroke rather than a wire. Roughly 25 lines of code replaces a whole
vector-graphics library.

```js
var w = wid(i / pts.length)
var a1 = Math.atan2(pts[i][1] - pts[i-1][1], pts[i][0] - pts[i-1][0])
var a2 = Math.atan2(pts[i][1] - pts[i+1][1], pts[i][0] - pts[i+1][0])
var a = (a1 + a2) / 2
```

### 2. The brush taper is one line

```js
wid = (x) => 1 * Math.sin(x*Math.PI) * mapval(Noise.noise(x*10), 0, 1, 0.5, 1)
```

`sin(πt)` is zero at both ends and widest in the middle, which is exactly a
brush load and lift. The noise term gives organic variation. That line is why
the stems look drawn rather than plotted, and it is worth copying literally.

### 3. `bezmh` — a rational quadratic Bézier through midpoints

Given a polyline, treat each interior point as a control point, connect
midpoints, and sample each segment 20 times. The result is a smooth curve, cheap,
library-free, and **the same primitive for stems, leaves, petals and veins**.
The `w` weight makes it rational, which is what lets the curve be pulled toward
the control points for curl.

For us this collapses to 2D (`[x, y]` rather than `[x, y, z]`) and is the one
curve primitive M0c needs.

### 4. Shape is a width profile along the organ, with an exponent for pointiness

```js
var flowerShapeMask = (x) => Math.pow(Math.sin(Math.PI*x), 0.2)
var leafShapeMask   = (x) => Math.pow(Math.sin(Math.PI*x), 0.5)
PAR.leafShape = randChoice([
  (x) => Noise.noise(x*leafJaggedness, seed) * leafShapeMask(x),
  (x) => Math.pow(Math.sin(Math.PI*x), leafPointyness),
])
```

An exponent below 1 gives a broad, flat-topped profile; above 1 gives a pointed
one. **This is the bridge between our discrete loci and geometry.** Our
`petal.shape` alleles map naturally onto profile functions:

| `petal.shape` | Profile | Note |
|---|---|---|
| `rounded` | `sin(πt)^0.5` | broad, blunt tip |
| `obovate` | `sin(πt)^0.7` skewed late | widest past the middle |
| `spatulate` | `sin(πt)^0.2` over a narrow base | flat top on a claw |
| `ligulate` | narrow strap, `sin(πt)^0.9` | parallel sides |
| `clawed` | narrow base, wide tip | piecewise |

`petal.margin` (entire, ruffled, fringed, notched) then perturbs the profile
with high-frequency noise, and `petal.curl` bends the centreline with `bezmh`'s
weight rather than the profile. Those are three separate loci touching three
separate parts of one drawing routine, which is a good sign the decomposition is
right.

### 5. Leaf and petal are the same routine with different parameters

`leaf()` takes `seg` (~40 segments), `wid` (the profile), `vei` (vein count),
`ben` (a per-segment bend, sampled randomly), and `col` as a min/max HSV pair
interpolated from base to tip. So a leaf is a tapered tube with veins and a
colour gradient, and a petal is the same thing with a different profile and
palette. M0c should have one organ-drawing function, not one per organ kind.

### 6. Paper texture: noise, speckle, and gold flecks

`paper()` renders a 512×512 tile: a Perlin base colour, minus per-pixel random
speckle (`c -= Math.random()*tex`), with about **0.5% of pixels** given a
gold-brown fleck at `c*0.7, c*0.5, c*0.2`. It writes each pixel four times,
mirrored, so the tile is seamless.

That is the whole secret of the gold-flecked ground, and it is about 25 lines.

### 7. Colour is HSV with a base-to-tip gradient

Colour is a `{ min: [h,s,v,a], max: [h,s,v,a] }` pair interpolated along the
organ, which is why petals are darker at the throat and lighter at the edge.
`lerpHue` picks the **shortest way round the hue circle**, the same rule as our
`rotateHue` in `epistasis.ts`. Our phenotype already produces hue, saturation
and lightness, so M0c should interpolate our three values across the same range
rather than inventing a second colour model.

---

## Do not copy

### 3D with Euler rotations

`nonflowers` builds and draws in 3D: `v3` has rotation matrices, and `toeuler`
recovers a rotation from a direction by **brute-force searching angles in 5°
steps** (`for x in -180..180, for y in -90..90`). It is called per node during
branching.

We are deliberately 2D (spec §3, §9.1). Our `Structure` carries `x, y, angle`
and that is sufficient for a flat ink illustration. This is a case where reading
the reference confirms an existing decision: we are avoiding a large amount of
machinery, and a brute-force inverse that would be a real cost in the gallery
where thousands of plants are generated per run.

### A global `Math.random` override, with a clock seed

`nonflowers` replaces `Math.random` process-wide and seeds from
`new Date().getTime()`. Reproducibility is available only by passing `?seed=` in
the URL, and the Perlin permutation table is filled from `Math.random`, so it too
depends on that seed being set first.

Two plants from the same seed are identical, but only because nothing else
consumed randomness in between. That is fragile in a way our design cannot
afford: our whole sync model rests on two devices deriving the same plant from
identical inputs (spec §12). We keep explicit seeding via `rngFrom`, and the
noise permutation table must be derived from it rather than from `Math.random`.

### Anonymous parameter draws instead of named loci

Their genome is ~59 `normRand` and `randChoice` calls filling a flat `PAR`
object, many of whose values are functions rather than scalars.

This produces excellent variety in 200 lines, and it is the right choice for
"generate a pretty flower from a seed". It is the wrong choice for us, because
nothing in it can be **bred**: there are no loci to recombine, no dominance, no
recessive that hides and reappears, and no way to explain to a user which gene
did what. Spec §4 commits to named loci precisely so that `descendants` can be
audited and a pedigree chart can mean something. Worth stating plainly that this
is a fork in the road, not an oversight on their part.

### A DOM canvas for the texture

`paper()` calls `document.createElement('canvas')`. Our engine is isomorphic and
must run in Node for the gallery, so the texture has to be a pure function
returning pixel data (`Uint8ClampedArray`), painted into whichever canvas the
caller has. Everything else in this note survives that change.

---

## What this means for M0c

Concrete, and it changes the plan for the better:

1. **One curve primitive** (`bezmh`, 2D) and **one stroking primitive**
   (`tubify` into a filled polygon). Everything is drawn with those two.
2. **One organ-drawing routine** parameterised by a width profile, a vein count,
   a colour ramp and a bend. Leaf, petal and sepal are configurations of it.
3. **Our discrete loci map onto it directly.** `petal.shape` selects the profile
   function, `petal.margin` perturbs it, `petal.curl` bends the centreline,
   `leaf.form` and `leaf.margin` do the same for leaves, and `pigment.*` supplies
   the ramp. That is the first place the genome visibly earns its keep, and it
   suggests M0c should start with `petal.shape` rather than with stems.
4. **A seeded noise function** derived from `rngFrom`, with a fixed permutation
   table per plant, not per process.
5. **A pure texture function**, so the gold-flecked paper works in the gallery.

Estimated: the two drawing primitives plus a seeded noise are perhaps 150 lines,
which is small. The work in M0c is in **tuning the profile parameters until the
organs look like the species they claim to be**, and that is the part no amount
of reading replaces. Which is the argument for getting to pixels quickly.
