# How Ink Garden works

**Date:** 2026-10-03
**Status:** explains the mechanics as built at M0b Task 4. Genetics and timing
work and are verified against real biology. **Nothing is drawn yet** — see the
status table at the end.

This document explains the machinery end to end, using one real flower traced
through the actual code. Everything quoted here was produced by running it.

---

## The one idea everything follows from

**A flower is data, not pixels.**

A plant is a hash of 79 pairs of allele indices. Every petal, thorn, colour and
bloom date is *computed* from those numbers. Nothing is stored as an image, and
nothing is drawn until the moment someone looks at it.

That single choice is what makes everything else possible:

- a whole garden fits in a few kilobytes
- two devices agree without syncing anything
- a flower can be regrown perfectly from its name years later
- a wallpaper can be rendered at any resolution, because there is no source image

---

## The chain, in order

### 1. A name becomes a genome

```
"Amara"  ──hash──▶  79 allele pairs
```

Each locus gets two alleles, drawn from the species distribution for that locus,
seeded by the hash of the name. `"Amara"` gives genome `ebf14888`, forever, on
any device. **The name is the seed.** Change one letter and it is a different
plant.

There are 79 loci in two kinds:

| Kind | Count | Alleles are | Example |
|---|---|---|---|
| Discrete | 26 | a **name** | `thornless` / `thorned` |
| Quantitative | 53 | a **number** that sums into a trait | two height loci summing to stature |

The discrete ones are where breeding gets interesting, because recessives hide
and reappear.

### 2. Genome becomes phenotype, in two layers

This split matters more than it sounds, and it was got wrong at first.

| Layer | What it knows | Amara |
|---|---|---|
| `express(genome)` | Only the genome. Traits are relative, species-free | `petal.count` is **absent** |
| `expressPlant(genome, species)` | The genome **and** the species | 5.0 petals, height 1.50, hue 283 |

The reason for two layers: **a petal count is meaningless without knowing the
species.** A daisy has five petals; a dandelion head has around fifty ligulate
florets. Petal number is *canalised* — fixed by the species, not voted on by the
genome. So `express` deliberately refuses to invent one, and a test asserts that
it does not.

The species also sets the **scale**. The exact same alleles expressed as a
jacaranda give height 10.0 rather than 1.50. **The genome decides the variation;
the species decides what the thing is.**

### 3. Discrete traits resolve through the blend coefficient

Each discrete locus has a `blend` between 0 and 1:

| `blend` | Meaning | A heterozygote shows |
|---|---|---|
| `0` | complete dominance | only the higher-ranked allele |
| between | incomplete dominance | both, the lower one partly masked |
| `1` | codominance | both, equally |

Allele order within a locus **is** the dominance series, so the higher index wins
under complete dominance. That has a consequence worth stating plainly: **a
recessive mutant must sit at the lower index.** Three loci had it the wrong way
round, which made a double flower dominant and fifty times too common.

Amara is `thorned` because rosemary's distribution favours that allele. Her
colour is `delphinidin`, which ranks above cyanidin and pelargonidin, giving a
violet base.

### 4. Epistasis rewrites some of it

Eight rules run in order on top of the resolved traits. Amara's violet comes from
*two* rules chaining: delphinidin sets the base hue, then copigment pushes it
further toward blue.

The rule that matters most for breeding:

> **Doubling converts stamens into petals, so petal count multiplies and
> fertility drops.**

Double flowers are also recessive, and the measured rate is about **0.15%** of
plants, against a theoretical 0.16% for an allele at 4% frequency. The prettiest
flower really is the worst breeder, and that tension is deliberate.

### 5. Weather becomes a clock

```
latitude + elevation + date  ──▶  daily weather
daily weather                ──▶  growing degree days
accumulated warmth           ──▶  germination → juvenile → vegetative → bud → bloom
```

**Development runs on accumulated warmth, not the calendar.** Rosemary needs
about 1060 growing degree days for this plant, which is roughly 800 days in
Glasgow and 240 in Nairobi. Amara, sown on day 100 in Glasgow, is in bloom after
900 days.

Two gates hold a plant at `bud` even when it is warm enough:

- **Photoperiod.** Daylength, computed from latitude and date.
- **Vernalisation.** Accumulated chilling hours below a threshold.

That is why a plant can be ready and still not flower, and it is what makes bloom
dates predictable enough to promise in advance on a specimen card.

The weather itself comes from a deterministic estimator, which is also the
offline fallback: Open-Meteo replaces it wholesale at M5. Checked against reality:
Glasgow's annual mean comes out 8.0 °C against a real 9.0, wet days 50% against
47%, and Nairobi at 1,795 m comes out 17.0 against a real 19.0.

### 6. Then it becomes structure, then ink

**Neither of these exists yet.**

- The **meristem** turns a phenotype into organs with positions and angles:
  internodes, leaves, buds, flowers, arranged by phyllotaxis.
- **Geometry** turns organs into brush strokes, and the renderer draws them.

Those are M0b Tasks 5 to 11 and then M0c.

---

## Breeding

```
Amara  ×  Kofi   named "Lupin"   ──▶   genome 04a4aa02
```

Each parent contributes one allele per locus, chosen by a hash of the child's
name. Same parents and the same name always give the same child, verified by
re-running it.

**Naming a child is choosing a roll of the dice from those two parents.** Rename
it and it recombines differently. That is why the name is not decoration: it is
an input to meiosis.

Recessive traits hide in heterozygotes and reappear in later generations. That is
the entire reason for having discrete loci rather than sliders, and it is what
makes a pedigree chart worth looking at.

---

## Three things that make it feel like a real plant

**1. Traits have three architectures.** Every discrete locus is tagged
`canalised`, `polymorphic` or `homeotic`, and the default allele frequency
follows. Real populations are mostly monomorphic with a tail of rarer variants.
A first pass with uniform defaults gave **75% of plants green petals**, where
green flowers are uncommon in nature.

**2. Canalisation hides variation.** `flower.canalisation` normally pins petal
number to the species value while the plant silently carries `petal.variance`
alleles. Lose canalisation — roughly 1 in 600 plants — and that hidden variation
expresses at once, as petal *loss*, down to zero. This is not invented: it is the
published behaviour of *Cardamine hirsuta*, where a single regulatory divergence
releases cryptic variation. **A plant can carry something invisible for
generations and then unlock it.**

**3. Nothing is ever lost.** A flower fades, the plant persists, and the record
is permanent. That is a product rule with a mechanical consequence: no organism
is ever destroyed by neglect, and allometric constraints thicken a stem rather
than removing an organ.

---

## Why determinism is the load-bearing property

Every step above is a pure function of its inputs. No `Math.random`, no
`Date.now()`, no iteration over unordered maps where order affects the result.
All randomness is integer-only, seeded from strings.

That buys three things that are otherwise expensive:

- **Two devices agree without syncing.** The garden is a small document; every
  derived value is recomputed identically on each device, so there is almost
  nothing to reconcile.
- **The future can be computed.** A widget can be handed a pre-computed timeline
  of future states, because the plant's state days from now is already knowable.
- **Verification is possible.** The same code run under Node (V8) and Bun
  (JavaScriptCore) produces byte-identical output, confirmed through twelve
  generations of breeding. If it did not, a plant would differ depending on which
  device grew it.

---

## Running it yourself

```bash
cd packages/engine
pnpm test                                                     # 188 tests
pnpm typecheck

node src/cli/dump.ts --species rosemary --seed Amara           # genome + phenotype
node src/cli/descendants.ts --species dandelion --generations 10
node src/cli/descendants.ts --species jacaranda --json
```

`descendants` breeds a closed population for N generations and reports every
trait's range. It is the plausibility harness the art gate depends on.

---

## Status

| Part | State |
|---|---|
| 79-locus genome, inheritance, mutation, recombination | **Built** |
| Species baselines, trait architecture, canalisation | **Built** |
| Weather, thermal time, phenology, solar geometry | **Built** |
| Meristem, phyllotaxis, branching, allometry | Planned, M0b Tasks 5–11 |
| Anything drawn on screen | **Not started** |
| Database, garden view, breeding UI, wallpapers, notifications | Designed, not built |

Two honest notes.

**The engine currently produces numbers, not pictures.** That is the least
satisfying stretch of the project and it is deliberate: building a renderer on a
simulation that turns out to be wrong is the expensive mistake.

**The design is reliable about structure and unreliable about values.** Across
two milestones, no interface has needed to change, but a long list of numeric
constants were wrong in ways only real-world output revealed — a solar model 20
minutes short every day, a temperature formula that made Glasgow average −4 °C,
and a mutation that appeared fifty times too often. The lesson, recorded in the
plans: **run the thing and read the numbers before believing anything.**
