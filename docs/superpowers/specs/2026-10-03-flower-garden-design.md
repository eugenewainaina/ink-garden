# Ink Garden — Design Specification

**Date:** 2026-10-03
**Revision:** 3 — supersedes revisions 1 and 2. Revision 2 redesigned the genome,
growth, weather and acquisition models. Revision 3 changes the platform and
notification model, and replaces the infinite scroll with bounded, expandable
beds.
**Status:** Approved design, not yet implemented
**Working name:** Ink Garden (provisional; see Open Questions)

---

## 1. Purpose

A browser-based garden of procedurally grown flowers. Each plant is a simulated
organism with a real genome: it inherits traits from its parents, develops from a
meristem under the influence of real weather at a chosen place, blooms on a
schedule driven by accumulated warmth, sets seed, goes dormant, and returns
larger the following season. Users breed new plants, name them, write on their
specimen cards, and export the garden or a single plant as a wallpaper.

The product began as a gift for one person and is designed so that she is account
number one without any part of the product being about her.

### Design evidence

Three open-source generative art projects (kept in `inspo/`, all MIT licensed)
plus two pieces of prior art, plus private research about the intended first
user. **The private research is deliberately not committed and must never be
committed.** See §14.

### Prior art, and what each contributes

| Source | Contribution |
|---|---|
| `nonflowers` | The look: procedural brushwork, ink and wash. And the key lesson that good procedural flowers sample from a *constrained* space, not from everywhere |
| `fishdraw` | Deterministic seed → artwork, seed doubles as the name, polyline output, self-drawing animation |
| `shan-shui-inf` | The origin of the handscroll garden view: a scrolling landscape with depth layering, in SVG. Its **infinity was rejected** for this product (§9.1), because a garden accumulates content where a screensaver does not |
| **PlantStudio** (Kurtz-Fernhout, 1995–2002, GPL, [source](https://github.com/pdfernhout/PlantStudio), [writeup](https://pketh.org/plantstudio.html)) | A botany simulator by a biologist and an ecologist. Its flowering and fruiting submodel was translated from **EPIC, the USDA Agricultural Research Service crop model**, so its phenology is weather-driven. It ships a **Breeder** with similarity and mutation controls, a 10-step Plant Wizard that teaches botanical terms, and a "change age" feature that re-derives a plant at any point in its life. It also scoped itself to herbaceous plants |
| [kiss_the_sky](https://github.com/matthewmain/kiss_the_sky) | A browser game built on a "programmatic replica of Mendelian genetics": genes, alleles, mutation, sexual reproduction, cross-pollination, seasons, and an ambient mode that runs for days |
| [The Algorithmic Beauty of Plants](https://algorithmicbotany.org/) | The canonical reference: parametric L-systems, phyllotaxis, and developmental models of plants |
| [Context Free](https://www.contextfreeart.org/) ([source](https://github.com/MtnViewJohn/context-free)) | Grammar-based shape rewriting. Used here for organ templates only, not as the genome |

The property shared by the generative references, and the foundation of this
design: **the organism is data, not pixels.** A genome is a few hundred bytes.

### The central design lesson

**Random genomes are mostly ugly.** Sampling sixty loci freely from a hash
overwhelmingly produces nonsense: a rose with sunflower petals on a grass stem.
Every generator that looks good samples from a *curated, constrained* region of
its parameter space. This shapes §4.7 and the build order in §15, and it is the
main risk to the product.

---

## 2. Non-negotiable constraints

Product invariants. Implementation may change freely; these may not.

1. **No machine learning anywhere.** No AI generation, naming, summarising,
   recommending or writing. All generative output is geometry, noise, simulation
   and hash functions.
2. **Nothing is ever lost.** This replaces the earlier and less precise rule that
   nothing wilts. Blooms are ephemeral on purpose, as real ones are. The plant
   persists, strengthens and blooms again. Specimen cards, names, numbers,
   footnotes and memory notes persist permanently. No plant can be destroyed by
   neglect.
3. **Nothing dies of neglect, and weather never damages.** A cold snap holds a
   bud back; it cannot kill it. This is a deliberate departure from strict
   realism in favour of rule 2. Natural senescence at the end of an annual's life
   is expected rather than a loss: the individual does not return, its seed and
   its permanent specimen card do.
4. **Tradeoffs, never punishments.** Hard traits cost something real (a double
   flower sets less seed; a very tall thin stem bends), but no trait makes a
   plant fail.
5. **No streaks, no daily-login pressure, no guilt mechanics.** Absence has no
   cost.
6. **Tending can only ever help.**
7. **No suspense about state.** The app always shows what it is doing and when
   things will happen, and explains *why* when a prediction moves. Hidden content
   is permitted only as a deliberate gift reveal, never as an unclear state.
8. **No advertising, analytics, third-party trackers, recommendation feeds,
   leaderboards or engagement mechanics.**
9. **No accounts are required to view one's own garden.** Local data is the
   source of truth for the UI; the server is a durable mirror.
10. **No forced re-authentication.**
11. **Notifications are event-only and never absence-driven.** The app may tell a
    user that something *happened*: a bloom started, a seed is ready, a pollinator
    brought something, a frost is coming. It may **never** generate a message
    because the user was *absent*. No reminders, no streaks, no "your garden
    misses you", no re-engagement of any kind. At most one notification a day,
    and silence on days when nothing happened, which is most days. Each type is
    individually toggleable, and permission is requested in response to a
    deliberate tap. See §9.5.
12. **No caterpillars or larval life stages.** Pollinators appear as adults only.
13. **The full genome is visible from the start.** Every locus, every allele,
    every label. No fog, no locked traits, no withheld data. Biology is explained
    in place, in the tradition of the PlantStudio wizard.

---

## 3. Architecture

```
genotype    Record<LocusId, [Allele, Allele]>     stored, diploid, breedable
    │ express(genome)                              dominance, epistasis, allometry
phenotype   a vector of trait values
    │ develop(phenotype, thermalTime, lifecycle)   meristem / phytomer simulation
structure   geometry, at any age
```

Those three layers are kept strictly separate, and the separation is what makes
the system testable. Genetics is verified with Punnett assertions and statistical
tests over thousands of simulated crosses, with no rendering involved. Appearance
is verified visually, with no genetics involved. Tangling them makes both
untestable.

```
┌──────────────────────────────────────────────────────────┐
│  Web app (Vite + React + TS), installed as a PWA         │
│                                                          │
│  genome ──express──▶ phenotype ──develop──▶ geometry      │
│  (pure TS, zero dependencies, isomorphic)                │
│                                                          │
│  local store (IndexedDB) = source of truth for the UI    │
│  solar math (local, no network) = day/night lighting     │
│  renderer (canvas) + SVG export                          │
│  service worker: offline cache, Web Push, app badge      │
└──────────────────────────────┬───────────────────────────┘
                               │ Supabase JS
                               ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase (Free plan)                                    │
│  Postgres + RLS · Email OTP auth · Storage (backups)     │
└──────────────────────────────▲───────────────────────────┘
                               │ service role
┌──────────────────────────────┴───────────────────────────┐
│  Vercel: static hosting + one daily cron                 │
│  1. keep-warm  2. weather fetch + backfill               │
│  3. backups    4. event notifications (VAPID web push)   │
└──────────────────────────────┬───────────────────────────┘
                               │ Open-Meteo (no API key)
```

### Key architectural decisions

**The simulation is client-side and dependency-free.** It must run offline, so
development cannot be a server call. It is a pure isomorphic TypeScript module so
the same code renders in the browser and generates specimen sheets in Node.

**Vercel hosts only static assets and one cron.** Supabase provides database and
auth and the client talks to Postgres directly under RLS. No application server.

**Weather is fetched server-side and stored per place per day.** Because
phenology is derived from weather history rather than stored, every device must
see identical weather or gardens diverge. It also means user devices never
contact Open-Meteo.

**Sunrise and sunset are computed locally.** Solar position is a pure function of
latitude, longitude and date, so day/night lighting needs no network.

**Growth depends on the full weather history since planting.** This is a hard
requirement: the client must have weather rows covering `planted_at` to now. The
cron is responsible for completeness, including backfilling gaps from Open-Meteo's
historical archive. See §7.5.

**The platform is the PWA, not a native app.** iOS and iPadOS 16.4+ support Web
Push and the Badging API for Home Screen web apps, delivered over APNs, with **no
Apple Developer Program membership required**. That covers the app, offline use,
notifications and a live icon badge, with nothing that expires. Apple exposes no
web API for widgets, so a native widget extension is the only feature that would
require leaving the platform; it is deferred to its own phase (§15.2) rather than
paid for now, because every native distribution route expires and would turn the
product into a maintenance obligation.

### Stack

| Concern | Choice |
|---|---|
| Language | TypeScript |
| Monorepo | pnpm workspaces: `packages/engine`, `apps/web` |
| UI | Vite + React |
| Rendering | Canvas 2D, with an SVG export path |
| PWA | `vite-plugin-pwa` (Workbox). Home Screen install, offline, no Apple Developer Program required |
| Notifications | Web Push (VAPID) sent by the cron, plus the Badging API. Event-only, see §9.5 |
| Local store | IndexedDB |
| Database + auth | Supabase (Postgres, RLS, email OTP) |
| Hosting | Vercel (static) + Vercel Cron |
| Transactional email | Custom SMTP (Resend free tier) |
| Bot protection | Cloudflare Turnstile via Supabase Auth CAPTCHA |
| Weather | Open-Meteo forecast + archive APIs (no key) |

---

## 4. The genome

### 4.1 Shape: a shallow regulatory hierarchy

The genome is **two levels deep**, modelled on how plant development actually
works:

```
master identity loci        what is this organ?      (~8 loci, ABC-style)
        │ gates and scales
modifier loci               how big, what colour, how many   (~50 loci)
```

**Why hierarchical, in plain terms.** A flower is built in four concentric rings
called whorls. Three classes of gene, A, B and C, are active in overlapping zones,
and the combination present determines what each ring becomes:

| Whorl | Position | Genes active | Becomes |
|---|---|---|---|
| 1 | outermost | A | sepals |
| 2 | second | A + B | petals |
| 3 | third | B + C | stamens |
| 4 | centre | C | carpels |

A and C repress each other, which keeps the zones sharp. This is the ABC model,
and it is one of the best-understood mechanisms in developmental biology.

The consequence for this product: **lose C function and whorl 3 becomes petals
instead of stamens.** One locus, and a single flower becomes a double flower.
This is not hypothetical; it is how double roses, carnations and peonies came to
exist, and the same class of homeotic mutation produces a leaf becoming a bract
or a sepal becoming a petal. In real plants, novelty usually arrives as one
switch rather than a thousand nudges.

So realism and good surprise are the same feature here. A flat genome would be
simpler and would quietly cost the best moments in the product.

The hierarchy is deliberately **shallow**. Two levels, not a network. Every
realism benefit, none of the uncontrollability, and the whole thing is
explainable in one sentence to a non-biologist.

### 4.2 Locus catalogue

Approximately 60 loci. Discrete loci are where breeding delight lives, because
recessives hide and reappear.

**Master identity**

| Locus | Alleles |
|---|---|
| `flower.organ.identity` | sepals petaloid / normal |
| `flower.doubling` | single / double |
| `flower.symmetry` | actinomorphic / zygomorphic |
| `inflorescence.type` | solitary, spike, raceme, panicle, umbel, corymb, head, cyme |
| `leaf.form` | simple, pinnate, bipinnate, palmate, cordate |

**Habit and stem.** Discrete: `habit.determinacy` (determinate, indeterminate),
`phyllotaxis.pattern` (alternate, decussate, whorled, spiral), `stem.pigment`,
`stem.pubescence`. Quantitative: height, internode length, stem thickness, branch
angle, branch count, apical dominance.

**Leaf.** Discrete: `leaf.margin` (entire, serrate, dentate, lobed),
`leaf.venation` (pinnate, palmate, parallel), `leaf.variegation` (none, marginal,
splashed, striped), `leaf.pubescence`. Quantitative: length, width, petiole,
gloss.

**Armature.** Discrete: `thorn.presence` (thorned, thornless). Quantitative:
density, curvature, length. Presence/absence is the cleanest Mendelian trait
available and thornless roses are a real breeding objective.

**Flower.** Discrete: `petal.shape`, `petal.margin`, `flower.throat`,
`nectar_guide`. Quantitative: diameter, petal count, petal length, petal width,
curl, overlap, substance (thin and translucent versus thick and velvety).

**Pigment.** The module worth the most investment, because the constraints are
what turn colour into a puzzle rather than a slider.

| Locus | Alleles or effect |
|---|---|
| `pigment.anthocyanidin` | none, pelargonidin, cyanidin, delphinidin |
| `pigment.carotenoid` | none, yellow, orange, red |
| `pigment.petal.chlorophyll` | none / green |
| `pigment.intensity` | quantitative, 3 loci |
| `pigment.copigment` | quantitative, 2 loci. Flavonols; blues the hue |
| `pigment.vacuolar.ph` | quantitative, 2 loci. Acidic red, neutral blue |
| `pigment.pattern` | solid, gradient, picotee, blotch, speckled |
| `pigment.cold.response` | quantitative. How much cold deepens colour |

**Phenology.** `thermal.base_temp`, `thermal.constant`,
`photoperiod.response`, `photoperiod.critical`, `vernalization.required`,
`vernalization.hours`, `dormancy.depth`, `senescence.rate`. All heritable, which
is what allows an early line and a late line to be bred, and what welds the
genetics to the weather system instead of leaving them as two features.

**Lifecycle.** `lifecycle` (annual, biennial, perennial). Founder stock carries
its real lifecycle.

**Allocation.** `allocation.root_shoot`, `allocation.leaf_vs_stem`. Modest
effects in v1, present so a carbon-budget model can be added later without
reshaping anyone's genome.

### 4.3 Inheritance

**One dominance coefficient per locus**, which buys the full range for free:
`0` recessive, `0.5` incomplete or codominant, `1` complete. Codominance matters,
because two different anthocyanidins both expressing is how real hybrids get
mixed colours.

**Quantitative traits are genuinely polygenic.** Three to five loci per trait,
each allele worth 0 or 1, summed. This is barely more code than a single
continuous allele and it produces two things a slider never will:

- a proper bell curve across a population
- **transgressive segregation**, where offspring land outside both parents' range

The second is real, it happens constantly in plant breeding, and it produces the
moment where a cross yields something taller or redder than either parent. That
moment is the entire reason to have genetics instead of a colour picker.

### 4.4 Epistasis

A small explicit rule table. This is where realism and surprise come from.

| Interaction | Result |
|---|---|
| delphinidin + high copigment + high pH | true blue. Any one missing gives violet or purple-red |
| carotenoid + anthocyanin | red, orange or bronze: anthocyanin laid over yellow |
| petal chlorophyll + carotenoid | green flowers |
| **doubling × petal count** | **stamens become petals, so petal count multiplies and fertility drops** |
| variegation | not Mendelian. See §6.5 |

The doubling tradeoff is the one to protect. Double flowers genuinely set less
seed, which means the most beautiful plant in a garden is also the worst breeder.
That tension is real and it is the best strategic decision the product offers.

### 4.5 Mutation

Mutation lives inside the same hash as everything else:
`hash(childName | locusId)`. Reproducible forever. Mutations are **logged and
surfaced**, because a new trait appearing is the best moment the product can
deliver and it must never happen silently.

### 4.6 Genome versioning

A `genome_version` field, and a migration rule that fills new loci
deterministically from the plant's own hash. Add a locus in v2 and every existing
plant gains a consistent new trait rather than a random one or a crash.

Because bred plants are stored rather than re-derived, a future change to the
locus list cannot silently turn someone's rose into a different plant.

### 4.7 The beauty constraint

This is the section that determines whether the product holds up.

**Founding stock is hand-tuned.** The seed drawer holds a small number of
carefully authored template genomes, one per real species. These are the centres
of gravity.

**Variance is bounded.** A founder's genome is its template plus deviation within
limits chosen per locus. Novelty is real but never absurd.

**Allometry priors enforce plausibility.** Real plants obey scaling laws whether
they want to or not: leaf area is tied to stem cross-section, a stem's height is
limited by its own diameter, flower size scales with petal size. Without these, a
genome produces a rose with sunflower petals on a grass stem, which reads as
wrong instantly even to someone who cannot say why. These are **soft**
constraints, a plausibility prior that pulls proportions toward realistic
relationships while permitting genuine novelty. Hard clamps would be realistic
and boring.

**A validity check** scores a genome for plausibility. The laboratory warns before
an implausible genome is committed, rather than letting a user build something
that cannot render, and the renderer degrades gracefully instead of refusing
outright. Nothing a user has grown may ever become unviewable.

**Breeding inherits from parents**, so lineages naturally stay near the region of
genome space that already looks good.

---

## 5. Development and growth

### 5.1 It is a simulation, not a reveal

**This replaces revision 1's "growth as progressive reveal of a fixed drawing."**
A fixed drawing cannot be realistic, because real growth is meristems producing
new organs. The plant at day 40 is whatever the simulation says it is at day 40.

**The rules that matter most, in order of payoff:**

1. **Meristem and phytomer.** The shoot apical meristem repeatedly produces a
   phytomer: one internode, one leaf, one axillary bud. Phyllotaxis places
   successive leaves at approximately **137.5°**, the golden angle. Apical
   dominance suppresses axillary buds, which is why a stem grows as one shoot
   rather than a bush. Internodes then elongate, generally more in low light.
2. **ABC organ identity** (§4.1) determines what each primordium becomes.
3. **Correct timing** (§7) makes the plant flower in its real season.
4. **Allometry** keeps proportions plausible.
5. **Senescence and dormancy** give it a life.

Get the first two right and a plant reads as a plant even in silhouette. Nothing
later compensates for missing them.

### 5.2 Thermal time drives development

Development does not advance on the calendar. It advances on **accumulated
warmth**, which is the standard method in agronomy and is what PlantStudio
inherited from EPIC.

```
GDD_day    = clamp((Tmax + Tmin) / 2 − Tbase, 0, Tupper)
accumulated thermal time drives stage transitions and organ production
```

A plant has stages — germination, juvenile, mature vegetative, bud, bloom, seed
set, senescence, dormancy — and transitions between them are triggered by
accumulated thermal time, photoperiod, or accumulated chilling, depending on the
species.

### 5.3 Lifecycles

Every plant is annual, biennial or perennial, inherited from its lineage.

- **Annual:** germinates, grows, blooms, sets seed, senesces, and the *lineage*
  continues through its seed. The individual does not return, but its seed does,
  and the specimen card is permanent.
- **Biennial:** vegetative the first year, blooms and seeds the second.
- **Perennial:** blooms, sets seed, goes dormant, and **returns larger each
  year**. A three-year-old rosemary is a substantial shrub, not a seedling that
  flowered once.

This is the change that gives the garden age. It is also why the garden is worth
returning to for years rather than weeks.

### 5.4 Senescence, and how it stays kind

Real flowers fade. The rule that resolved this: **nothing is ever lost, but
blooms are ephemeral.**

- A bloom fades on a **predicted, visible schedule**. The card states when.
- Fading is **not** a loss. The plant persists. The card, name, number, footnote
  and memory note are permanent.
- A faded bloom leaves a seed head or fruit where the species does that.
- The plant **blooms again**, and perennials bloom more each year.
- Every bloom is **recorded** as an event, so a plant accrues a history of
  blooms rather than a single state.

Nothing is ever the user's fault, and nothing is ever gone. This is a rhythm
rather than a failure, which is what makes realism compatible with rule 2.

### 5.5 Performance

Re-simulating on every frame is wasteful. Simulate at discrete ticks (one
simulated hour), memoise by `(genomeHash, tick, lifecycleState)`, and re-run only
when the tick advances. Plants are a few hundred organs; this is cheap.

### 5.6 Tending

One gesture, once per day, for the whole garden: **water**. Additive only. Rain
counts automatically (§7). Missing a day costs nothing. There is no per-plant
chore list and no streak.

Watering reduces drought stress, which affects growth rate. It can move a
predicted bloom **earlier, never later**, and the card says so when it changes.

---

## 6. How new plants are acquired

Revision 1 said pollinators were the only source of invented flowers. **That rule
is withdrawn.** Hand-pollination is how plant breeding has actually worked for two
centuries, and forbidding it would be absurd in a product about breeding.

There are now **three acquisition paths**, all deterministic, and all producing
the same artefact: a child genome from two parents plus a name.

### 6.1 Autonomous pollination

Pollinators — bees, hummingbirds, butterflies, moths, beetles — cross whatever is
blooming. The user does not choose. Serendipity.

Visits are **derived, not stored**: the visit schedule is a pure function of
`(flowerId, dayIndex, hourIndex)` through the seeded RNG, so all devices compute
an identical history without syncing it.

No larval stage is ever shown. Pollinators need no feeding and add no chore.

### 6.2 Deliberate crossing

The user selects parent A and parent B. This is the breeder's tool and the centre
of the product.

```ts
meiosis(parent) = pick one allele per locus, using hash(childName | locus | parentId)
child           = crossover(meiosis(a), meiosis(b)), then mutate(hash(childName | locus))
```

Pure functions. `("Amara", parentA, parentB)` produces the same plant forever, on
any device, with mutation reproducible too.

### 6.3 Selfing

Real plants do it, and it is how a trait is fixed into a stable line.

### 6.4 Crossability, predicted before committing

Real breeding has barriers. Same species crosses freely; same genus usually
works; different genera are mostly impossible, and when they do work the offspring
is often sterile, like a mule.

Genetic distance determines crossability. Wide crosses are **permitted**, but
**the app states before the user commits** that the offspring will be sterile.
A trap becomes a strategic choice, and no user is left in suspense.

### 6.5 Bud sports: novelty without sex

Variegated plants are chimeras: patches of tissue with different genetics. They
are not Mendelian, because they inherit through cell lineage rather than allele
segregation. This is why most variegated cultivars arose as **bud sports** — one
branch mutates, someone takes a cutting, and a cultivar exists.

Both are modelled: a branch may carry a somatic mutation, making the plant
chimeric, and a cutting can stabilise it.

### 6.6 Naming, and why species become lineages

With breeding, "species" stops being a useful classifier, because a bred flower
is not a species. A garden rose is a cultivar. So:

- Founding stock in the seed drawer carries its real species.
- Everything bred is a **cultivar** of its maternal lineage, written the way
  botanists write it: `Rosa 'Amara'`.
- A cross between different lineages takes the hybrid marker:
  `Rosa × Mentha 'Amara'`.

This is honest, it is textually beautiful on a specimen card, and it stops the app
pretending a hybrid is a species.

### 6.7 Ploidy, deferred

Real roses are frequently tetraploid, and whole-genome duplication is one of the
largest sources of ornamental novelty, giving bigger flowers and sturdier plants.
It is excellent material and it is a mess to implement, because tetraploid
segregation is not Mendelian and would complicate the entire inheritance layer.

Diploid only in v1, with `ploidy` in the genome from day one.

### 6.8 The offspring predictor

Before committing a cross, the app shows the **expected distribution of the
offspring**: exact for discrete loci, an expected distribution for quantitative
ones. It is pure computation over data already held, so it is cheap, and it is the
feature that makes the genome feel like a real instrument rather than a slot
machine.

The full genome is visible from the start (rule 13), so this is an instrument with
labels, not a puzzle.

---

## 7. Time, light, weather and phenology

### 7.1 Two systems, and only one needs the network

**Local, offline, no network:** solar position from `(latitude, longitude, now)`
gives sunrise, sunset, solar altitude, and therefore true dawn, dusk, golden hour
and night. This is the lighting backbone and works with no connection.

**Network, optional, cached:** daily weather from Open-Meteo, fetched by the cron
and stored per place per day.

### 7.2 The invariant

Revision 1 said weather never changes the schedule. **That was wrong, and it is
replaced.**

> **The schedule is computed from real weather, and is always explained.**

Development runs on accumulated thermal time (§5.2), plus photoperiod,
vernalisation and water. When a prediction moves, the app says why: *"needs about
60 more warm hours, and the forecast has that arriving Thursday."* That is more
explainable than a wall clock, not less.

The reason revision 1 fenced weather out was predictability. The reason it can be
let in is that thermal time is computed from stored, shared data, so it stays
deterministic across devices, and the forecast makes it predictable in advance.

### 7.3 Mechanisms, all real

| Mechanism | Effect | Source |
|---|---|---|
| Thermal time (GDD) | Drives all developmental transitions | EPIC, as inherited by PlantStudio |
| Photoperiod | Daylength controls flowering in many species; computable from latitude and date, offline | Standard photoperiodism |
| Vernalisation | Accumulated chilling required before flowering. Why bulbs need winter | Standard |
| Water | Precipitation plus user watering reduces drought stress; stress slows development | EPIC |
| Solar radiation | Contributes to growth in EPIC-style models | Requires `shortwave_radiation` in the weather table |

### 7.4 Appearance and posture

Weather also drives rendering: palette and sky from weather code and solar
altitude, rain rendering, wind amplitude, leaf droop, petals closing at dusk and
opening in sun, fog reducing contrast, snow as dormancy appearance.
`pigment.cold.response` deepens colour in cold, which is real and is a direct link
from environment to phenotype.

### 7.5 Weather history is a hard requirement

Growth depends on the **full weather history since planting**, so the client needs
weather rows covering `planted_at` to now.

- The cron adds one row per place per day and **backfills gaps** from Open-Meteo's
  historical archive API.
- Until a client holds a complete range, it displays its last computed estimate
  rather than recomputing from partial data. This prevents two devices disagreeing
  because one is missing a day.
- Data volume is trivial: at most 365 rows per place per year, under half a
  kilobyte each.

### 7.6 Place

The **garden** has a place, not the user. Users pick it from a search box backed by
Open-Meteo's geocoding API; browser geolocation is not used, so there is no
permission prompt. A user can therefore keep a garden in one city while living in
another, and the setting survives offline once cached.

Two gardens in the same place share one `places` row and one weather cache.

### 7.7 Offline fallback

Weather is a modifier with a documented neutral fallback. Lighting always works
from local solar math. When weather rows are missing, a seasonal estimate from
latitude and date is used for rendering only, and phenology uses the last complete
range. Nothing blocks, and nothing stored can diverge, because nothing dynamic is
stored.

---

## 8. The specimen card

Every plant carries a record. All fields optional; an untouched specimen is a
clean card, not a form the user failed to fill in.

| Field | Notes |
|---|---|
| Number | Consecutive within the garden, `#14` |
| Cultivar name | User-supplied, e.g. `Rosa 'Amara'` |
| Lineage | Founding species, or both parents with links |
| Generations | How far from founding stock |
| Dates | Planted; each bloom recorded as an event |
| Emphasis | `✩` to `✩✩✩`. An emphasis mark for the ones that matter, explicitly **not** a rating |
| Footnote | A free line, visually set apart as a footnote |
| Memory | A "while it was growing" note |
| Lifecycle | Annual, biennial, perennial |
| Genome | Full, visible, labelled, with the offspring predictor |

An SVG export of the card accompanies the plant's wallpaper export.

---

## 9. The garden and display

### 9.1 Garden view

Not a grid of pots. **A landscape scrolled horizontally**, like a handscroll, with
depth layers and beds along the ground. It opens where something last changed, so
a returning user never hunts for the new thing.

Because plants are perennial and perennials grow, the garden visibly matures.

**The garden is bounded but expandable, not infinite.** Revision 2 inherited an
infinite scroll from the `shan-shui-inf` reference. That reference is infinite
because it is a screensaver with no content and no destination; a garden
accumulates plants, so an unbounded axis buys open space and charges a navigation
problem in return, along with questions that have no good answers: what is at the
end of it, how does a user zoom out at four hundred plants, and at what point does
the overview become an unreadable smear. Instead the garden has a finite visible
extent, and filling it is answered by deliberately extending it, like taking on
another bed.

**Two ways to find things, because they answer different questions.**

- A **minimap** showing the whole garden at a glance, with plants by maturity,
  blooms highlighted, and anything that changed since the last visit marked.
- A **numbered index**, which is how the intended first user already organises
  everything she keeps. A minimap is spatial; a numbered list answers "where is
  #14" in a way no map can.

The minimap, the numbered index, the garden overview and the exported wallpaper
strip are **one renderer at four scales**.

### 9.2 Living-window mode

Full-screen, no chrome. Slow ambient motion, pollinators drifting, light matched
to real local time. This is the "watch them growing" experience.

### 9.3 Wallpaper export

- PNG at exact device pixel dimensions for common iPad, iPhone and MacBook sizes.
- Cropped to a single specimen (portrait) or the garden strip (landscape).
- SVG export for arbitrary sizes.
- No OS live wallpaper. iOS live wallpapers require a Live Photo and Android live
  wallpapers require a native app. Both are out of scope, and this is a stated
  limitation rather than an oversight.

### 9.4 Motion and accessibility

- `prefers-reduced-motion` disables ambient motion and shortens reveals.
- Text scales with system settings.
- The card, the genome view and the garden are keyboard-navigable.
- Colour is never the sole carrier of meaning.

### 9.5 Notifications

Delivered as Web Push by the daily cron (§13), with the app badge carrying a quiet
count of new things. iOS and iPadOS 16.4+ support both for Home Screen web apps,
over APNs, with no Apple Developer Program membership.

**The invariant: notifications report events, never absence.**

| Allowed | Forbidden |
|---|---|
| A bloom has started | "Your garden misses you" |
| A seed is ready to collect | "You have not visited in 3 days" |
| A pollinator brought a seed | Streaks, milestones, "you're on a 5-day roll" |
| Frost is coming, so a plant will go dormant | Anything generated because the user did nothing |

Rules:

- **At most one notification per day.** On a slow garden that means most days are
  silent, which is the intended behaviour rather than a bug.
- Each type is individually toggleable.
- Permission is requested in response to a deliberate tap during onboarding, never
  on load, which is both an iOS requirement and the polite pattern.
- The badge shows the count of new events and clears when the app is opened.
- Focus modes apply, so a user can silence the garden without resigning from it.
- Because the cron runs daily, notifications are day-granular. A bloom is a
  day-scale event so this is sufficient; sub-day timing is not promised.

---

## 10. Data model

```sql
create table places (
  id        uuid primary key default gen_random_uuid(),
  label     text not null,
  latitude  double precision not null,
  longitude double precision not null,
  timezone  text not null
);

create table gardens (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text,
  place_id    uuid references places(id),
  beds        smallint not null default 1,    -- bounded, expandable extent
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table plantings (
  id              uuid primary key default gen_random_uuid(),
  garden_id       uuid not null references gardens(id) on delete cascade,
  cultivar        text not null,
  lineage         text not null,              -- genus label, e.g. 'Rosa'
  genome          jsonb not null,             -- stored, never re-derived
  genome_version  smallint not null,
  ploidy          smallint not null default 2,
  lifecycle       text not null,              -- annual | biennial | perennial
  origin          text not null,              -- founder | cross | self | sport
  parent_a        uuid references plantings(id),
  parent_b        uuid references plantings(id),
  sterile         boolean not null default false,
  planted_at      timestamptz,                -- null = seed in the drawer
  watered_on      date,                       -- last manual watering
  emphasis        smallint not null default 0,-- 0..3
  footnote        text,
  memory          text,
  bed             smallint not null default 0,
  position        integer,
  deleted_at      timestamptz,                -- tombstone
  updated_at      timestamptz not null default now()
);

-- Blooms are events, because a plant blooms many times across seasons.
create table blooms (
  id           uuid primary key default gen_random_uuid(),
  planting_id  uuid not null references plantings(id) on delete cascade,
  bloomed_at   timestamptz not null,
  faded_at     timestamptz,
  thermal_time integer,                       -- accumulated GDD at bloom
  updated_at   timestamptz not null default now()
);

create table weather_days (
  place_id            uuid not null references places(id) on delete cascade,
  date                date not null,
  tmin_c              real,
  tmax_c              real,
  precip_mm           real,
  sunshine_s          integer,
  shortwave_radiation real,
  weather_code        smallint,
  primary key (place_id, date)
);

-- Web Push endpoints. One row per user per device.
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  prefs       jsonb not null default
                '{"bloom":true,"seed":true,"pollinator":true,"frost":true}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, endpoint)
);
```

### Notes

- **A collected seed is a `plantings` row with `planted_at is null`.** There is no
  separate seed table.
- **`genome` is stored, not derived.** Once breeding exists, the cultivar name
  cannot be the genome, because two flowers with the same name from different
  parents are different plants. Storing it also protects against a future locus
  list change turning someone's rose into a different plant. A ~60-locus genome is
  roughly 1 KB of JSON, which is negligible.
- Sunrise and sunset are **not** stored. Solar position is computed client-side,
  and two sources for one fact would eventually disagree.
- Indexes: `plantings (garden_id, updated_at)` for delta pulls;
  `blooms (planting_id)`; `weather_days (place_id, date)` is the primary key.
- `places` needs a uniqueness rule on rounded coordinates so two gardens in the
  same city share a row; a `get_or_create_place` RPC handles this, so clients never
  need broad insert rights on `places`.

---

## 11. Auth, security and RLS

### 11.1 Authentication

- Email OTP via Supabase Auth. No passwords.
- **Custom SMTP is mandatory.** Supabase's built-in mailer is capped at **2 emails
  per hour for the entire project**, which cannot support more than one user. With
  custom SMTP the cap becomes 30 new users per hour. Resend's free tier is ample.
- OTP code expiry: 10 minutes.
- Open signup with **Cloudflare Turnstile CAPTCHA on the OTP request from day
  one**. That endpoint sends mail to an address a stranger typed, which is the
  shape of a spam relay.
- **No forced re-authentication.** Sessions persist until sign-out or storage
  clearing.

### 11.2 RLS

RLS on every table in `public`. Policies use `TO authenticated` **with** an
explicit ownership predicate, and updates carry both `USING` and `WITH CHECK` so a
row's owner can never be reassigned.

- `gardens`: `owner_id = (select auth.uid())`
- `plantings`: `garden_id in (select id from gardens where owner_id = (select auth.uid()))`
- `blooms`: reachable through its planting, with the same ownership predicate
- `push_subscriptions`: `owner_id = (select auth.uid())`, readable and writable by
  the owner only. The cron reads it with the service role
- `places`: readable by all authenticated users; writes only through the
  `get_or_create_place` RPC (SECURITY INVOKER)
- `weather_days`: readable by all authenticated users; written only by the cron
  using the service role

Additional rules:

- No authorization decision reads `user_metadata`; it is user-editable.
- The service role key is never in client code or in any `VITE_`-prefixed
  variable.
- Views are created `WITH (security_invoker = true)`.
- `supabase db advisors` runs before every migration is committed.

### 11.3 Free-plan limitations and mitigations

| Limitation | Mitigation |
|---|---|
| Projects pause after 7 days of low activity | Daily cron generates activity, and local-first means a pause degrades to "sync unavailable", not data loss |
| No downloadable database backups | Daily cron dumps every garden to dated JSON in Supabase Storage, retaining ~30 days |
| Auth email cap of 2/hour on the built-in mailer | Custom SMTP |

---

## 12. Sync and offline

**Local IndexedDB is the source of truth for the UI.** The server is a durable
mirror so a garden survives a lost device.

The conflict surface is small by construction, because nothing dynamic is stored
and no synced field decreases.

| Operation | Merge rule | Loss risk |
|---|---|---|
| Plant a seed | Union by uuid | None |
| Water | `max(watered_on)` | None |
| Emphasis, footnote, memory, cultivar | Last write wins per field | Only if the same field is edited on two devices while both are offline |
| Position | Last write wins | As above, rare |
| Delete | Tombstone always wins | None |
| Growth, phenology, pollinator visits, rain-watering, and whether a plant is *currently* in bloom | Derived, never synced | None |
| Bloom events | Union by uuid; `faded_at` last write wins. Stored, because a plant accrues a bloom history across seasons | None |

Mechanics: pull rows where `updated_at > last_pull_at` for the garden; push local
dirty rows by upsert. Sync fires on app open, on regaining connectivity, and after
each change. Supabase Realtime between a user's devices is optional and not
required for correctness.

Failure is always quiet: a calm "saved on this device" line, never a red error.

**Clock skew.** Derived state depends on local `now`. Skew of minutes is
irrelevant at a scale of days, and `planted_at` is written once and never
recomputed, so growth cannot drift.

---

## 13. Operations

One daily cron function on Vercel does four jobs:

1. **Keep-warm.** A few requests against Postgres to stay clear of the free-plan
   pause. Cadence beyond one run per day depends on Vercel's free-tier cron
   granularity, to be confirmed at implementation time.
2. **Weather.** For every distinct place, fetch daily weather from Open-Meteo and
   upsert into `weather_days`, **including backfilling any missing days** from the
   historical archive. Requests carry coordinates only, no identifiers.
3. **Backups.** Dump every garden with its plantings and blooms to a dated JSON
   object in Supabase Storage, retaining roughly 30 days.
4. **Notifications.** For each garden, compute which event notifications are due
   using the same deterministic phenology the client uses, apply the user's
   per-type preferences, and send them over Web Push. At most one per garden per
   day. A day with no events produces no messages. The sender's decision function
   must depend only on events and never on time-since-last-visit (§9.5).

A stopped cron stops notifications as well as sync, which is the same free-plan
caveat and is acceptable because nothing is lost.

A garden is also exportable and importable as a single file from within the app,
independent of the server. That is the user-facing guarantee that a garden
outlives the service.

---

## 14. Privacy

- No analytics, no third-party scripts other than Turnstile, no advertising.
- The only personal data held is an email address and a chosen place.
- User devices never contact Open-Meteo; only the server does.
- Weather requests carry coordinates and nothing else.
- **The private research this design is based on must never be committed.** No
  quotes, profiles or personal details from it belong in any tracked file. This
  matters more than usual because the app is intended to become publicly
  reachable.
- `.gitignore` covers `.DS_Store`, `.gstack/`, `node_modules/`, `.env*`, and
  `evidence/`, `research/`, `*.chat.txt` for local notes.

---

## 15. Build order

The risk is concentrated in the art. Nothing downstream is worth building until
plants are plausible across a wide range of genomes and ages.

| Milestone | Content | Gate |
|---|---|---|
| **M0** | Engine: genotype → phenotype → structure. ABC identity, the locus catalogue, thermal time, meristem and phytomer development, allometry priors. Four founding species. A Node gallery rendering each species at several ages and seasons | **Art gate:** each species is recognisable without a label, plausible at every age, and **a thousand generated descendants of them still look like plants** |
| **M1** | Renderer, growth over real time, lifecycle and dormancy, bloom and fade, specimen card | Growth is legible across seasons and the card is beautiful when empty |
| **M2** | PWA shell, sealed-envelope onboarding, IndexedDB, seed drawer, planting and watering | Works fully offline |
| **M3** | Breeding: meiosis, crossover, mutation, selfing, the offspring predictor, genome view | Genetics proven by test; two devices converge |
| **M4** | Supabase project, schema, RLS, email OTP with Turnstile, custom SMTP, sync | RLS proven by test |
| **M5** | Solar lighting, weather, phenology wiring, the daily cron | Offline fallback verified while online; cron verified in production |
| **M6** | Bounded expandable beds, garden landscape, minimap, numbered index, living-window mode, wallpaper and SVG export | Exports at exact device sizes; the minimap, index and wallpaper strip are one renderer |
| **M7** | Pollinators, autonomous pollination, crossability and sterility, bud sports | Two devices compute identical visits |
| **M8** | Web Push, notification preferences, the app badge, the cron notification job | No notification can be produced by absence, verified by test |
| **Later** | Trees, polyploidy, self-incompatibility, carbon allocation, seasonal hemisphere detail | — |

**The first account is the gift.** Her garden opens with a plant grown from a seed
string that is her own name, and the envelope reveal is hers before anyone
else's.

### 15.1 Onboarding

First visit is a sealed envelope bearing the user's name. Opening it plays the
bee-and-petals reveal drawing itself stroke by stroke, then enters the garden. It
appears once per user, never re-seals, carries no badge, and stays reopenable from
a quiet corner for anyone who wants to see it again.

Every user's first plant is grown from their own name, which gives a new garden
something unambiguously personal without the product making any claim about
anyone.

### 15.2 Deferred phases

Two features are deliberately deferred rather than dropped. Neither is committed
and neither is in scope for v1.

**Native widget.** The only feature that requires leaving the web platform. Apple
exposes no web API for widgets; WidgetKit lives in a native target, which means an
Apple Developer Program membership, code signing, and a distribution route that
expires and must be re-uploaded. It is nonetheless an unusually good fit, because
the simulation is deterministic and can hand WidgetKit a **pre-computed timeline of
future entries**, sidestepping the refresh-budget limitation that makes most
dynamic widgets disappointing. A widget could show a flower opening on Thursday and
be correct with the app closed and no network. It warrants its own spec once the
web app has earned the upkeep, and the iPad is the better target.

**Generative audio.** Not committed, and the analysis is genuinely mixed. The good
part is determinism: the same hash that draws the petals can compose the motif, so
a plant sounds the same forever, and **a bred plant could inherit an audible blend
of both parents**. The risk is that generic generative ambience is the closest
thing in this design to the stock-AI aesthetic the intended first user would
reject, and her relationship with music is album-shaped and specific rather than
ambient. If it is built, it should be **sound design rather than a soundtrack**: a
tone when a bud opens, a drone after dark, rain that is rain, silence otherwise.
Off by default, never autoplay, paused when backgrounded, respecting the silent
switch.

---

## 16. Testing

| Area | Approach |
|---|---|
| Engine determinism | Golden-file tests: fixed seed strings produce byte-identical output **within** an engine |
| Cross-engine determinism | Tolerance-based comparison. `Math.sin` and friends are not required to be correctly rounded, and V8 and JavaScriptCore differ in the last bits. All geometry output is quantised to 1e-3 at the phenotype→structure boundary so this cannot change derived state |
| Genetics: discrete | Punnett-square assertions per epistasis rule, including recessive masking and the doubling interaction |
| Genetics: quantitative | Statistical tests over thousands of simulated crosses: expected means, expected variance, and the presence of transgressive segregation |
| Genetics: mutation | Mutation rate matches configuration; the same `(childName, parents)` always yields the same mutations |
| Allometry | Plausibility scoring across a large random genome sample; the refusal path works |
| Art gate | The gallery is regenerated and reviewed on every engine change, at several ages and seasons |
| Phenology | Thermal time accumulation against known GDD values; prediction accuracy against a held-out weather series; and monotonicity **with respect to user actions** — no user action may push a bloom later, though weather legitimately can |
| Solar math | Unit tests against known sunrise/sunset values across latitudes and dates |
| Sync merge | Table-driven tests over §12, including tombstone-wins and last-write-wins |
| RLS | Tests proving user A cannot select, update or delete user B's gardens, plantings, blooms or push subscriptions, and cannot reassign ownership |
| Notifications | A property test asserting no notification can be produced by absence: the sender's decision function is a pure function of events and must not accept time-since-last-visit as an input at all |
| Export | An exported garden round-trips identically |
| Accessibility | Reduced motion, keyboard navigation, text scaling, meaning not carried by colour alone |

---

## 17. Explicitly out of scope

No AI of any kind. No streaks, guilt or decay. No ads, analytics or
recommendation feeds. **No absence-driven notifications of any kind** (§9.5). No
leaderboards. No public garden or social features. No caterpillars or larval
stages. No live wallpapers. No native app or widget in v1 (§15.2). No in-jokes or
references to the intended first user inside the product. No claims about what any
user likes. No silent changes to something a user has grown attached to.

---

## 18. Open questions

1. **Product name.** Working title "Ink Garden"; "Paper Garden" the alternative.
   The PWA manifest requires one before M2.
2. **Trees.** Coconut, mango and avocado are landscape-scale and need the bed and
   minimap views first. Confirm after M6.
3. **Polyploidy.** Deferred, and genuinely powerful. Revisit after M7.
4. **Self-incompatibility.** A real mechanism and a good later constraint.
5. **Carbon allocation.** The allocation loci exist in v1. Confirm whether a
   source-sink growth model is wanted later.
6. **Cron granularity on Vercel's free tier.** Confirm at M5. If limited to once
   daily, the keep-warm ping fires several requests in that one run.
7. **Realtime between a user's devices.** Nice to have, not required. Decide at M4.
8. **Multiple gardens per user.** The schema permits it; v1 ships one.
9. **Genome cross-section view.** With the full genome visible from the start,
   confirm whether a chromosome-style visualisation or a simple labelled list is
   the better first presentation.
10. **Native widget.** Deferred to its own phase (§15.2). Needs a decision on
    whether to take on an Apple Developer Program membership and a build that must
    be re-uploaded periodically.
11. **Generative audio.** Deferred and uncommitted (§15.2). If it happens, sound
    design rather than a soundtrack.
12. **Bed size.** How large is one bed before a user should extend? Needs a real
    answer at M6, and should be generous rather than stingy.
