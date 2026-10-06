# Plant form: the space we need to cover

**Date:** 2026-10-03
**Purpose:** the research input to the growth-form design. Answers "which
mechanisms buy recognisability, and in what order", so the catalogue becomes
data rather than a pile of special cases.
**Why this exists:** the M0b silhouette check drew a dandelion as a stem with
leaves on it. A dandelion is a rosette. The model has no vocabulary for that,
and no catalogue can fix it.

## Confidence, stated up front

This project has been bitten four times by confident unverified numbers, so:

- **Verified against primary sources** — Corner's rules hold empirically; the
  Hallé–Oldeman model names are in live use. Cited inline.
- **My recall, not verified** — the full 23-model list, Raunkiær's definitions,
  and the individual habit mechanisms. These are well-established botany and I
  am confident about the *concepts*; I have **not** verified specific numbers or
  the complete model list. Anything load-bearing for code needs checking before
  it is implemented.
- Specific gaps I could not close are listed at the end.

---

## 1. Two taxonomies, and they are orthogonal

**Hallé–Oldeman architectural models** (Hallé & Oldeman, 1970) describe how a
plant is **built**: the behaviour of its meristems. About 23 named models, each
named after a botanist.

**Raunkiær life forms** describe how a plant **survives the unfavourable
season**, classified entirely by where the perennating bud sits relative to the
ground.

| Life form | Bud position | Examples |
|---|---|---|
| Phanerophyte | exposed, high, on woody shoots | trees, shrubs |
| Chamaephyte | near ground, below 25 cm | thyme, many alpines |
| Hemicryptophyte | at ground level | most perennial herbs |
| Geophyte | buried (bulb, corm, tuber) | daffodil, crocus, onion |
| Therophyte | survives only as seed | annuals |
| Epiphyte | on another plant | orchids, bromeliads |
| Helophyte / hydrophyte | in mud or water | reeds, water lilies |

**The important finding: they are independent.** A single architectural model
appears across several life forms, and vice versa — a geophyte can bolt into a
caulescent shoot (daffodil), and a rhizomatous hemicryptophyte can build
essentially the same architecture as a woody phanerophyte (bamboo).

**This matters to the engine.** It says our split between *structure* and
*phenology/lifecycle* is correct and should stay: the grow-loop decides shape,
the life form decides what happens in winter. Neither should leak into the
other. It also says a bulb is a **lifecycle** feature and a rosette is an
**architectural** feature, which are two different pieces of work that a
daffodil happens to need both of.

---

## 2. The 23 architectural models collapse to about five axes

This is the useful reduction. The models are not 23 independent programs; they
are points in a space defined by a few meristem behaviours:

1. **Growth rhythm** — continuous, or rhythmic with the meristem resting between
   flushes.
2. **Axis differentiation** — one trunk with subordinate branches (monopodial),
   several equivalent axes, or a sympodium where the leader is replaced.
3. **Branching position and timing** — terminal or lateral; immediate
   (*sylleptic*) or delayed until the next flush (*proleptic*).
4. **Axis orientation** — orthotropic (vertical) or plagiotropic (horizontal).
5. **Fate of the meristem** — does flowering terminate the axis and kill it
   (hapaxanthic) or not?

Many combinations are not viable or not observed, which is why the space
collapses. **Implement the axes, not the models.** Then a model is a named
point in that space and a species picks one.

*Verified:* Corner's model is monocaulous (a single unbranched axis with a
terminal inflorescence) and Stone's is branched — confirmed in live use in an
architectural study of *Atractocarpus* ([Bruy et al. 2018, Frontiers in Plant
Science](https://doi.org/10.3389/fpls.2018.01262)).

**A deniable but important consequence:** a tree may not need its own loop. Our
current caulescent shoot with high apical dominance, a trunk concept and
proleptic branching may already *be* a tree — the jacaranda in the silhouette
was recognisable as a sapling at dominance 0.90. If that holds up, trees are a
configuration, not a mechanism, which is a large saving.

---

## 3. Corner's rules are real and usable as constraints — VERIFIED

Corner's rules are correlations between the size of an axis and the size of the
appendages it bears. The core rule:

> **Thick axes bear large appendages and branch sparingly; thin axes bear small
> appendages and branch profusely.**

Empirically confirmed, on *Leucadendron*:

> "branch ramification was related to leaf traits via Corner's rules such that
> more highly ramified shoots had smaller leaves" — [Roddy et al. 2019,
> PeerJ](https://peerj.com/articles/7362/)

And a modern synthesis treating the rules as a live framework, warts included:
[Lauri 2019, *New Phytologist*](https://nph.onlinelibrary.wiley.com/doi/10.1111/nph.15503),
"issues and steps forward". Related work finds large leaves on thick, sparingly
branching twigs associated with rapid stem elongation ([Olson et al., *American
Journal of Botany*](https://doi.org/10.1002/ajb2.1800)).

**Why this is worth having.** We already have a pipe model relating stem radius
to leaf area. Corner's rules add the *inverse* constraint — the thing that stops
a genome producing a pencil-thin stem carrying rhubarb leaves, which is exactly
the kind of nonsense the beauty constraint exists to prevent. It is a cheap,
real, empirically supported constraint on a system that currently has almost no
coupling between leaf size and branching intensity.

Caveat from the review literature: the correlations are trends with real
scatter, not laws, and they do not hold equally in all lineages. Use as a soft
constraint (a plausibility penalty), not a hard clamp.

---

## 4. The non-woody habits are genuinely separate loops

Unlike the tree models, these are not points in one space. Each has a
**different generative rule**, which is why "add a habit parameter" cannot
work.

| Habit | The generative rule | State it needs |
|---|---|---|
| **Rosette** (acaulescent) | Internodes do not elongate. Leaves are produced from a compressed crown, so they all emerge at ground level, arranged by phyllotaxis, with outwards-and-upwards divergence. Optional **bolting**: under a trigger, internodes elongate and the same leaves lift into a spiral. | internode elongation factor; bolted flag |
| **Rhizome** | A horizontal (plagiotropic) axis, below or at the surface, bearing scale leaves and adventitious roots. Aerial shoots emerge from its nodes, and each has its own life. Growth is sympodial: the apex either continues or turns up. | direction; depth; node spacing; aerial shoot count |
| **Stolon / runner** | Like a rhizome but **above** ground, with long internodes and a daughter plant (a rooted rosette or shoot) at each node. The daughter repeats. | direction; internode length; daughter rule |
| **Tillering (grass)** | Meristems sit at the **base**, not the tip. Many equivalent axes (tillers) originate from basal nodes, each enclosed by a sheath. Because the meristems are basal and low, the plant regrows after damage. No normal apical dominance. | tiller count; basal vs elevated meristems |
| **Climber** | The shoot does not self-support. It seeks and follows a support: by twining round it, by tendrils, by hooks or thorns, or by adventitious roots. Twining has a **direction**, which is taxonomically consistent. With no support, most become prostrate or scramble. | support-seeking; twining direction; attachment mode |
| **Succulent** | Water-storing tissue, reduced surface area, slow growth. Many are rosette-like (aloe, agave, echeveria); some are stem succulents with vestigial leaves (cactus); some are leaf succulents (sedum). | water storage ratio; leaf vs stem; growth rate |
| **Geophyte** | A storage organ (bulb, corm, tuber, tuberous root) perennates below ground and is **replaced annually**; the aerial shoot is new each year. | storage type; annual replacement |
| **Prostrate / decumbent** | Stems are too weak to stay upright, so the shoot lies down and the tip turns back up (negative gravitropism). | stem strength; gravitropic correction |

**Woodiness** is not a habit but a **property**: a shoot that lays down secondary
tissue. The same species can be woody in one climate and herbaceous in another,
so it belongs with the allometry and rendering work, not the loop dispatch.

---

## 5. The minimum covering set

Checked against a list of **57 recognisable species** spanning temperate
maritime and tropical highland gardens (draft of the catalogue's habit column).
A single growth-form label each, so the histogram is only as good as the
selection — see the caveat below.

```
growth form                 species   share   cumulative
rosette                        11     19%         19%
tiller / grass                  7     12%         32%
woody shrub                     7     12%         44%
climber / scrambler             6     11%         54%
caulescent herb                 5      9%         63%
tree                            5      9%         72%
rhizome                         4      7%         79%
stolon / runner                 4      7%         86%
geophyte                        4      7%         93%
prostrate                       2      4%         96%
succulent (non-rosette)         2      4%        100%
```

If the existing caulescent loop already covers herbs, shrubs and trees (17 of
57, 30%), then adding mechanisms in this order gets us to:

```
  add mechanism                     species   running   share
  rosette                            11        28     49%
  tiller / grass                      7        35     61%
  rhizome + stolon                    8        43     75%
  geophyte                            4        47     82%
  climber / scrambler                 6        53     93%
  prostrate                           2        55     96%
  succulent                           2        57    100%
```

### What this changes about my reasoning

Three corrections, all from measuring instead of reasoning:

1. **Rhizome and stolon are one mechanism, not two.** They differ only in
   whether the horizontal axis runs above or below the surface, and both end in
   a daughter shoot at a node. Together they are 14% of species, which makes
   them the **second** unlock after rosette and a better second target than
   tillering — and cheaper than a climber.

2. **Succulence is not a growth form; it is leaf and stem geometry.** Four of
   the six succulents in the list are *rosette* succulents (houseleek, aloe,
   agave, echeveria), already counted under rosette. Implement rosette plus
   thick, water-storing leaves and aloe comes nearly free. So the last line of
   the histogram costs one loop but only two species, and those two are a leaf
   property as well.

3. **Climbers are more numerous than I ranked them** (6, tied with rhizome
   alone) but cost more, because support-seeking is a behaviour rather than a
   shape. They stay mid-table on a cost-adjusted basis.

### The cost-adjusted recommendation

| # | Mechanism | Species | Cost | Why here |
|---|---|---|---|---|
| — | Caulescent shoot | 17 | have it | erect herbs, shrubs, trees |
| 1 | **Rosette + bolting** | 11 | **low** | the current loop with elongation suppressed; also unlocks rosette succulents |
| 2 | **Horizontal axis** (rhizome + stolon + daughter rule) | 8 | low–medium | one rule, above or below ground |
| 3 | **Tiller / grass** | 7 | medium | inverts the loop: meristems at the base, many equivalent axes |
| 4 | **Geophyte** | 4 | low | mostly a *lifecycle* feature (storage + annual replacement) once rosette exists |
| 5 | **Climber** | 6 | medium | needs support-seeking, which is behaviour |
| 6 | **Prostrate** | 2 | low | a gravitropic correction on the existing loop |
| — | Succulence | 2 (+4) | low | leaf geometry, not a loop |

**The headline stands and is now measured: rosette is the big unlock and it is
nearly free.** It is the current loop with internode elongation switched off
plus a trigger to switch it back on. It moves coverage from 30% to 49% on its
own, and it is the specific thing the silhouette check caught.

**Caveat, and it is a real one:** the species list is my own selection, so the
histogram partly reflects which plants I happened to think of. It is biased
toward forms I know. The *shape* of the distribution (rosette first, succulence
collapsing into it, rhizome and stolon being one thing) is robust; the exact
percentages are not. It should be re-run against the real catalogue before it
decides the final order.

## 6. The gap list against what we have

| Dimension | We have | Missing |
|---|---|---|
| Phyllotaxis | alternate, decussate, whorled, spiral | rosulate (rosette arrangement) |
| Branching | apical dominance probability, branch angle | terminal vs lateral, sylleptic vs proleptic, sympodial |
| Axis orientation | vertical only | plagiotropic, gravitropic correction |
| Growth rhythm | continuous only | rhythmic flushing, resting buds |
| Meristem fate | infinite | terminal flowering, hapaxanthic death |
| Habit | one: erect caulescent | rosette, rhizome, stolon, tiller, climber, succulent, geophyte, prostrate |
| Woodiness | absent | secondary growth (property, not loop) |
| Leaf retention | absent | evergreen vs deciduous |
| Storage organs | absent | bulb, corm, tuber |
| Corner's rules | absent | soft constraint coupling leaf size to ramification |

The single line to take from this: **`habit.determinacy` is the only
growth-form locus we have, and it is not enough to distinguish a dandelion from
a jacaranda.** Everything in that table is the vocabulary gap.

---

## 7. What I could not verify, and would check before implementing

1. **The full 23-model list and each model's defining rule.** I know the
   concept, the axes, and several names (Corner, Stone, Rauh, Troll, Attims,
   Koriba, Massart, Leeuwenberg, McClure, Champagnat, Fagerlind, Barthélémy).
   I have not confirmed the complete list or every rule. **Not load-bearing** if
   we implement the axes rather than the named models.
2. **Corner's rules as precise coefficients.** The review literature uses effect
   sizes in forms I did not extract. The direction is verified; the magnitude
   is not.
3. **Raunkiær leaf size class boundaries** in centimetres. Not verified; needed
   for leaf geometry in M0c.
4. **Allometric exponents** (height vs diameter, self-thinning, the metabolic
   3/4) and how contested each is.
5. **Which plants use which divergence angles** beyond the golden angle.
6. **The growth-form histogram is measured but self-selected.** Section 5 is
   now checked against 57 species, which corrected the ranking twice, but the
   list is my own choice and is biased toward forms I know. Re-run it against
   the real catalogue before trusting the order.
