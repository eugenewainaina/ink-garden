# Leaf geometry and the rosette habit — design

**Date:** 2026-10-03
**Milestone:** the first picture of a plant.
**Predecessor:** M0b (development), tasks 1–8 done.
**Research input:** `docs/research/2026-10-03-plant-form.md`,
`docs/research/2026-10-03-nonflowers-techniques.md`

---

## 1. Goal

Draw a plant for the first time, and make one recognisable.

## 2. Acceptance test

> **A rosette of dandelion leaves that a person identifies as a dandelion with
> no flower present and no label.**

Written as a falsifiable test: shown the image cold, the answer is "dandelion",
not "some leaves". This is the art gate's first probe.

A dandelion rosette is identifiable from its leaves alone, which is why the
flower is out of scope. That defers the capitulum, which is a second
inflorescence architecture (hundreds of ligulate florets), not a variation of
the four-whorl flower `identity.ts` builds.

## 3. Scope

**In:** a renderer that makes images; leaf lamina geometry driven by the genome;
the leaf shape and margin loci a dandelion needs; the rosette growth form; a
growth-form seam; leaf divergence as a trait rather than a constant.

**Out:** flowers of any kind, ink and brush texture, colour beyond flat fill,
allometry, the full catalogue, the app, wallpapers. Leaf *venation* is drawn as
simple interior lines, not modelled.

---

## 4. Decisions

### D1. The engine decides the shape; the renderer decides the paint

The engine gains `dev/geometry.ts`, a pure function from a `Structure` to a
`Scene`: a flat list of closed polygons, each with a role (`leaf`, `stem`, ...)
and a base colour. No output format, no DOM, no dependency.

A new package `packages/render` turns a `Scene` into pixels: an SVG adapter
today, a canvas adapter when the app exists.

**Why this split.** The leaf's outline is determined by its genome, so it is
part of what the plant *is*, and it is pure maths that can be tested exactly.
How the shape is *painted* — flat fill now, brush strokes later — is separate
and has genuinely different consumers (files and a browser). Two adapters make
that a real seam rather than a hypothetical one.

The renderer is deliberately thin. That is correct here: the deep, tested part
(geometry) sits behind a small interface in the engine, and the renderer's job
is to isolate the engine from output formats. If it grew logic, the split would
be wrong.

### D2. Leaf shape needs two loci the catalogue does not have

`leaf.form` today is *compoundness*: simple, pinnate, bipinnate, palmate,
cordate. `leaf.margin` is entire, serrate, dentate, lobed. A dandelion leaf is
**oblanceolate and runcinate** — neither is expressible. Adding them is not
optional; the acceptance test cannot pass without it.

- **New locus `leaf.outline`** (canalised): the lamina shape. This milestone
  needs eight — orbicular, ovate, obovate, elliptic, lanceolate, linear,
  spatulate, oblanceolate. Deltoid, reniform, sagittate and hastate are
  **appended when a species needs them**, not guessed now.
- **Extended `leaf.margin`**: **append** `crenate`, `pinnatifid`, `runcinate`
  after the existing four. Deep lobing is a margin property, not a separate
  organ.

**Alleles are appended, never inserted.** Allele indices are the dominance
series and an existing genome's pairs are positional, so inserting an allele
would silently change what a stored plant means — the same hazard as inserting
a locus, one level down. Appending `crenate` at index 4 leaves `entire`
through `lobed` at 0 to 3 meaning exactly what they meant before.

**The geometry is one function, and the locus selects its parameters.** A lamina
profile is a Beta shape,

```
w(t) ∝ t^a · (1 − t)^b        normalised so max w = 1
```

which covers the standard outline terms by varying two exponents: `a = b` gives
elliptic, `a < b` widest toward the base (ovate), `a > b` widest toward the tip
(obovate, oblanceolate), and large exponents give linear. `leaf.outline` maps
each allele to an `(a, b)` pair. So one continuous family, twelve named
selectors, consistent with how `petal.shape` selects a profile exponent.

**`leaf.margin` then modulates the profile**, not the outline:

```
w(t) ← w(t) · (1 − depth · lobe(t))
```

where `lobe(t)` is a periodic term whose asymmetry points the teeth forward for
serrate and backward for **runcinate**, and whose depth runs from none (entire)
through shallow (serrate, crenate) to deep (lobed, pinnatifid, runcinate).

### D2b. The species templates must carry the new shape

A locus is only a capability. The acceptance test fails unless the **dandelion
template declares** `leaf.outline: oblanceolate`, `leaf.margin: runcinate` and
`habit.growth_form: rosette`, with the other three species declaring their own
outlines and the erect habit.

This is listed as its own decision because it is easy to implement the geometry,
leave the data at defaults, and conclude the geometry is wrong. The species
templates are part of the deliverable, not an afterthought.

### D3. New locus `habit.growth_form`, and it is canalised

The engine has `habit.determinacy` and height and nothing else about form. A
rosette is not a tall plant with short internodes; it is a different loop.

`habit.growth_form` is a **canalised** discrete locus — the species pins it, as
`lifecycle` does today. Alleles for this milestone: `erect`, `rosette`. Later:
`rhizomatous`, `stoloniferous`, `tillering`, `climbing`, `succulent`,
`geophytic`, `prostrate`.

Canalised is the right architecture because habit is what a species *is*, and
breeding should not casually turn a dandelion into a shrub. It can still move by
mutation, which is where interesting sports come from.

### D4. Genome version 2, and new loci are **appended**

`Genome.alleles` is a positional array parallel to `LOCI`, and
`deserialiseGenome` currently accepts an array *shorter* than `LOCI` without
complaint, which would produce a genome whose later loci are missing.

So: `GENOME_VERSION` becomes 2, **every new locus is appended to the end of
`LOCI`**, and `migrateGenome` pads a version-1 genome with the reference allele
for every appended locus. That makes migration a pure append and keeps
`locusIndex` stable for every existing locus, so version-1 genomes keep meaning
what they meant.

Nothing is released, so this is free. It will not be free later, which is the
argument for getting the leaf shape representation right in one pass rather
than patching it twice.

### D5. The growth-form seam, and M0b Task 10 is superseded

The M0b plan's `develop` (Task 10) assumed one growth form: it calls
`buildShoot` unconditionally. Adding a habit means a branch, and a branch inside
that function is the trap the research named.

So `develop` is written **once**, in this milestone, with the seam in place.
`develop` is the outer entry point; it calls `grow`, which is the habit seam:

```
develop(genome, species, ...) → Structure   // assembles; the entry point
  └─ grow(phenotype, species, seed) → Shoot // dispatches on habit.growth_form
       ├─ erect  → buildShoot(...)          // existing, unchanged
       └─ rosette → growRosette(...)        // new
```

`buildShoot` becomes the `erect` implementation, unchanged. The rosette is a
second implementation, not a conditional. **Task 10 of the M0b plan is
superseded and should be marked so**, rather than being built and then
refactored. Tasks 9 (allometry) and 11 (the structure CLI) stand.

### D6. The rosette needs almost no new machinery

This is the payoff of the research's "nearly free" claim, made concrete. A
rosette is:

- **no internode elongation** — every leaf attaches at the crown
- **many leaves** at one height, arranged by the existing phyllotaxis
- **a wide leaf divergence**, so leaves lie out flat rather than standing up

The existing projection already fans leaves correctly, because in-plane angle
comes from the azimuth. So the rosette needs no new maths — one loop that skips
elongation, and `LEAF_DIVERGENCE_DEG` promoted from a module constant to a
trait (rosettes are near 75°, erect herbs near 55°).

---

## 5. Components

| Module | Responsibility | Depends on |
|---|---|---|
| `dev/geometry.ts` *(new)* | `Structure` → `Scene`: lamina outline from the Beta profile, margin modulation, polygon assembly | structure, loci |
| `dev/leaf.ts` *(new)* | The lamina profile and margin functions, in isolation | nothing |
| `dev/grow.ts` *(new)* | `grow()` dispatching on habit; the rosette loop | meristem, layout, phyllotaxis |
| `dev/develop.ts` *(new)* | The assembler, superseding plan Task 10. Calls `grow()`, then geometry | grow, geometry |
| `dev/phyllotaxis.ts` | Divergence becomes a parameter | — |
| `dev/meristem.ts` | `buildShoot` becomes the erect implementation, unchanged | — |
| `packages/render` *(new)* | `Scene` → SVG; later → canvas | engine types only |
| `cli/gallery.ts` *(new)* | Renders a species sheet to a file | render |

## 6. Testing

**Pure, exact, in the engine:** the Beta profile (monotone where it should be,
maximum at the right place for each outline, symmetric for elliptic); margin
modulation (teeth count, depth bounds, runcinate asymmetry); polygon validity
(closed, non-self-intersecting, finite, positive area); the rosette loop (all
leaves at the crown, none elongated); habit dispatch (each allele reaches its
own loop); genome migration (a version-1 genome pads to version 2 and every
version-1 locus keeps its meaning).

**Not unit-testable:** whether it looks like a dandelion. That is judged by eye,
which is the point of the acceptance test, and the reason this milestone is
different from every one before it.

**Regression:** the silhouette sheet must remain byte-identical for the four
existing species, since this milestone adds a habit and shape loci but changes
no existing growth.

## 7. Risks

1. **The shape may still not read as a dandelion.** The Beta profile plus
   runcinate lobing is a reasoned guess from the literature, not a measured fit
   to a real leaf. Mitigation: the acceptance test is cheap, and profile
   parameters are tunable without touching the loop that places leaves.
2. **The genome change is irreversible in practice** once plants exist. Nothing
   is released, so now is the cheapest moment; this is stated rather than
   assumed.
3. **Leaf size class boundaries are unverified** (recorded in the research
   note). They matter for the catalogue more than for the dandelion, since the
   dandelion's dimensions come from its species template.
4. **The renderer may want to grow beyond thin.** If the ink layer arrives and
   the SVG adapter needs stroke flattening, the question of whether flattening
   is geometry (engine) or paint (renderer) reopens. Current answer: flattening
   is geometry, because it is pure maths; the renderer only serialises.

## 8. Out of scope, explicitly

Flowers and inflorescences, including the capitulum. Ink, brush strokes, paper
texture, gradients. Allometry and Corner's rules. Habit implementations beyond
`erect` and `rosette`. Venation models. The catalogue, the app, storage,
weather wiring, wallpapers.
