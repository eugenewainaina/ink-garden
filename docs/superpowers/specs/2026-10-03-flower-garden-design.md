# Ink Garden — Design Specification

**Date:** 2026-10-03
**Status:** Approved design, not yet implemented
**Working name:** Ink Garden (provisional; see Open Questions)

---

## 1. Purpose

A browser-based garden of procedurally drawn flowers. Flowers are generated from
a seed string, drawn as vector strokes, and grow over real time from seed to
bloom. Users keep a garden that advances whether or not the app is open, breed
new invented flowers by pollination, write on their specimens, and export the
garden or a single flower as a wallpaper.

The product is a small multi-user web app. It began as a gift for one person and
is designed so that she is account number one without any part of the product
being about her.

### Design evidence

The visual and interaction decisions in this spec derive from three open-source
generative art projects (referenced in `inspo/`) and from private research about
the intended first user. **The private research is deliberately not committed to
this repository and must never be committed.** See §14.

### What each reference contributes

| Reference | Contribution |
|---|---|
| `nonflowers` | The look: procedural brushwork, ink and wash, one specimen per panel, no image assets |
| `fishdraw` | The mechanic: deterministic seed → artwork, seed doubles as the name, polyline output, self-drawing animation |
| `shan-shui-inf` | The frame: an infinitely scrolling generated landscape rather than a grid |

The property shared by all three, and the foundation of this design: **the
artwork is data, not pixels.** A specimen is a few hundred bytes.

All three are **MIT licensed** (see `inspo/CREDITS.md`). They are references, not
dependencies: the engine ships no borrowed code and no assets. If any of their
algorithms are ever ported rather than reimplemented, the MIT notice and
attribution must be carried over.

---

## 2. Non-negotiable constraints

These are product invariants. Implementation may change freely; these may not.

1. **No machine learning anywhere in the product.** No AI generation, naming,
   summarising, recommending or writing. All generative output is geometry,
   noise and hash functions. This is a stated preference of the first user and
   also a simpler system.
2. **Nothing ever dies, wilts or regresses.** No plant can be lost. No decay.
3. **No streaks, no daily-login pressure, no guilt mechanics.** Absence has no
   cost.
4. **Tending can only ever help.** No action reduces progress or changes a
   schedule for the worse.
5. **No suspense about state.** The app always shows what it is doing and when
   things will happen. Hidden content is permitted only as a deliberate gift
   reveal, never as an unclear state.
6. **No AI, advertising, analytics, third-party trackers, recommendation feeds,
   leaderboards, or engagement mechanics.**
7. **No accounts are required to view one's own garden.** Local data is the
   source of truth for the UI; the server is a durable mirror. Losing network
   access must never lock a user out of their own garden.
8. **No forced re-authentication.** Sessions persist until the user signs out or
   clears storage.
9. **No notifications.**
10. **No caterpillars or larval life stages.** Pollinators appear as adults only.
    This is a specific aversion of the first user and a reasonable product rule.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Web app (Vite + React + TS), installed as a PWA         │
│                                                          │
│  ┌────────────────────┐   ┌──────────────────────────┐   │
│  │ engine (pure TS)   │   │ local store (IndexedDB)  │   │
│  │ seed→genome→strokes│   │ source of truth for UI   │   │
│  │ zero dependencies  │   └──────────────────────────┘   │
│  └────────────────────┘              │                   │
│           │                          │ sync (when online)│
│           ▼                          ▼                   │
│  ┌────────────────────┐   ┌──────────────────────────┐   │
│  │ renderer (canvas)  │   │ solar math (local, no net)│  │
│  └────────────────────┘   └──────────────────────────┘   │
└──────────────────────────────┬───────────────────────────┘
                               │ Supabase JS
                               ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase (Free plan)                                    │
│  Postgres + RLS · Email OTP auth · Storage (backups)     │
└──────────────────────────────▲───────────────────────────┘
                               │ service role
┌──────────────────────────────┴───────────────────────────┐
│  Vercel: static hosting + one daily cron function        │
│  1. keep-warm ping   2. fetch weather   3. dump backups  │
└──────────────────────────────────────────────────────────┘
                               │
                               ▼  Open-Meteo (no key)
```

### Key architectural decisions and why

**The engine is client-side and dependency-free.** It must run offline, so
generation cannot be a server call. It is a pure, isomorphic TypeScript module so
the same code renders in the browser and generates specimen sheets in Node for
review.

**Vercel hosts only static assets and one cron.** Supabase provides database and
auth, and the client talks to Postgres directly under RLS. There is no
application server to write, deploy or maintain.

**Weather is fetched server-side and cached in Postgres.** Because growth and
pollination are derived from `(garden state, time)` rather than stored, every
device must see identical weather or gardens diverge. A per-place daily weather
table guarantees agreement. It also means user devices never contact Open-Meteo,
so coordinates never leave our server.

**Sunrise and sunset are computed locally.** Solar position is a pure function of
latitude, longitude and date, so day/night lighting works with no network at all.
Only weather needs the network.

### Stack

| Concern | Choice |
|---|---|
| Language | TypeScript throughout |
| Monorepo | pnpm workspaces: `packages/engine`, `apps/web` |
| UI | Vite + React |
| Rendering | Canvas 2D, with an SVG export path |
| PWA | `vite-plugin-pwa` (Workbox) |
| Local store | IndexedDB |
| Database + auth | Supabase (Postgres, RLS, email OTP) |
| Hosting | Vercel (static) + Vercel Cron |
| Transactional email | Custom SMTP (Resend free tier) |
| Bot protection | Cloudflare Turnstile via Supabase Auth CAPTCHA |
| Weather | Open-Meteo (no API key) |

---

## 4. The engine

### Pipeline

```
seedString ──hash──▶ RNG ──▶ genome ──▶ strokes (polylines) + palette
```

Deterministic in the strict sense: the same seed string produces byte-identical
output, on any device, forever. No randomness outside the seeded hash. No assets.
No image files. Everything is computed at render time.

### Genome

The genome is the parameter set that fully determines a specimen's appearance.
Illustrative fields, all numeric and serialisable:

- phyllotaxis angle and jitter
- stem count, branching depth, curvature, taper
- leaf count, length, serration, venation depth
- petal count, length, width, curl, overlap, tip shape
- stamen and pistil count and length
- colour ramps: petal base, petal tip, centre, leaf, stem
- stroke properties: weight, taper, ink opacity, brush jitter

### Species are data, not code

A species is a named parameter set with a bloom duration and bounded ranges for
each field. Adding a species is adding a file, not a feature.

```ts
type Species = {
  id: string
  commonName: string
  binomial: string          // real binomial for real species
  genome: GenomeTemplate    // base values
  variance: GenomeTemplate  // permitted per-seed deviation
  daysToBloom: number
  stageFractions: {         // share of total duration per stage
    seed: number; sprout: number; leaf: number; bud: number
  }
}
```

### Seed strings and naming

The seed string is the flower's name. Real species use their own common and
binomial names. Invented flowers get a generated pseudo-Latin binomial derived
from their seed string, in the spirit of `fishdraw`. This keeps invented flowers
honestly labelled as invented.

### Cross-engine determinism, and why coordinates get quantised

`Math.sin`, `Math.cos`, `Math.pow` and friends are **not** required to be
correctly rounded, and in practice V8 and JavaScriptCore can differ in the last
bits. That matters here, because growth and pollination are derived per device:
a user on iPad Safari and the same user on a MacBook could otherwise disagree
about a flower, and the Node gallery could disagree with both.

The mitigation is cheap. The engine's final output step **quantises every
coordinate and stroke parameter to a fixed precision (1e-3)** before anything
downstream consumes it. Differences below that threshold vanish, so the genome →
strokes boundary is stable across engines. Determinism is then guaranteed by
construction within an engine, and made true for practical purposes across
engines.

Consequence for testing: byte-identical comparison is required per engine, and
tolerance-based comparison is used across engines (§16).

### First species set

Four, chosen so that recognisability can be proven before the catalogue widens:

| Species | Notes |
|---|---|
| Rosemary | Fine needle leaves, small pale blue flowers, woody stem |
| Dandelion | Basal rosette, single yellow composite head, seed head |
| Spearmint | Square stem, opposite serrated leaves, whorled pale flowers |
| Jacaranda | Fern-like bipinnate leaves, panicles of purple trumpet flowers |

The gate for this set: **each must be identifiable by a person who knows the
plant, without a label.** If it fails, the parameter sets are iterated until it
passes. Nothing else in the product is built until this gate is passed.

Trees (coconut, mango, avocado) are landscape-scale and deferred to a later
milestone.

---

## 5. Growth

### The core rule

Growth is **not** a separate animation. It is the progressive reveal of a
deterministic drawing, stretched across real time. The flower draws itself stroke
by stroke over days.

```
seed ──▶ sprout ──▶ leaf ──▶ bud ──▶ bloom
```

Stage and progress are pure functions:

```ts
stageOf(planting, species, now) => { stage, progress: 0..1 }
```

Because this is derived, the server needs no scheduler, the garden advances while
the app is closed, and two devices agree without syncing anything.

### Predictability

Each specimen card states its bloom time as an absolute date and time, for
example "Blooms Thursday, around 14:00". This is the resolution of the central
tension in the design: state is never uncertain, only gifts are withheld.

Watering can move the predicted bloom time **earlier, never later**, and the card
says so when it changes. Tending is a reward, not a chore.

### Tending

One gesture, once per day, for the whole garden: **water**. There is no
per-plant chore list.

- Watering is additive only.
- Missing a day costs nothing. There is no streak and no penalty.
- Rain counts as watering automatically (see §7), derived from weather data.
- The daily cap is on the gesture, not on the plant.

---

## 6. Pollinators and invented flowers

Pollinators — bees, hummingbirds, butterflies, moths, beetles — are the **only**
source of new flowers.

1. A flower reaching bloom becomes a pollinator target.
2. Visits are **derived, not simulated live**: the visit schedule is a pure
   function of `(flowerId, dayIndex, hourIndex)` through the seeded RNG. All
   devices therefore compute an identical history without syncing it.
3. Pollen carried between two bloomed flowers accumulates.
4. Past a threshold, a **seed pod** becomes available on one parent.
5. Collecting a pod creates a planting with `planted_at = null`, `parent_a` and
   `parent_b` set, and a seed string the user supplies.
6. That seed string determines the new genome, crossed from both parents'
   genomes, so a bred flower is descended from two flowers the user grew.

No larval stage is ever shown. Pollinators do not require feeding and never
introduce a chore.

---

## 7. Time, light and weather

### Two separate systems

**Local, offline, no network:** solar position from `(latitude, longitude, now)`
gives sunrise, sunset, solar altitude and therefore true dawn, dusk, golden hour
and night. This is the backbone of the lighting model and works with no
connection.

**Network, optional, cached:** current and daily weather from Open-Meteo, fetched
by the cron and stored per place per day.

### The invariant

> **Weather changes appearance and posture. It never changes the schedule.**

| Weather | Effect |
|---|---|
| Day/night | Palette, sky, light direction, shadow length |
| Rain | Rain rendering; leaves droop; petals weigh down; counts as watering |
| Wind | Petal and stem motion amplitude |
| Overcast | Flattened, cooler palette |
| Fog | Reduced contrast, layered depth fade |
| Snow | Dormancy appearance only. Never death, never lost progress |
| Cold/heat | Palette only. No growth-rate effect |

The tempting version — weather bending growth rates — is **explicitly rejected
for v1** because it would make the stated bloom time slip and would reintroduce
exactly the uncertainty the product forbids. It is noted in Open Questions as a
possible later opt-in.

Petals closing at dusk and opening in sun is the model example: the plant visibly
responds to its world while its schedule stays exact.

### Place

The **garden** has a place, not the user. Users pick it from a search box backed
by Open-Meteo's geocoding API; browser geolocation is not used, so there is no
permission prompt. This means a user can keep a garden in one city while living
in another, and it means the setting survives offline once cached.

Two gardens in the same place share one `places` row and one weather cache.

### Offline behaviour

Weather is a modifier with a neutral fallback. If weather data is unavailable:
lighting still works from local solar math, and the garden renders with a neutral
sky. Nothing blocks. The last seven days of weather are cached locally.

---

## 8. The specimen card

Every flower carries a record. All fields are optional, and an untouched specimen
is a clean, complete-looking card rather than an empty form.

| Field | Notes |
|---|---|
| Number | Consecutive within the garden, `#14` |
| Name | User-supplied; the seed string |
| Dates | Planted, and predicted or actual bloom |
| Emphasis | `✩` to `✩✩✩`. An emphasis mark for the ones that matter, explicitly **not** a rating |
| Footnote | A free line, visually set apart as a footnote |
| Memory | A "while it was growing" note |
| Provenance | For bred flowers, links to both parents |

An SVG export of the card accompanies the flower's wallpaper export.

---

## 9. The garden and display

### Garden view

Not a grid of pots. **A single continuous landscape scrolled horizontally**, like
a handscroll, with depth layers and beds along the ground. It opens at the
position where something last changed, so a returning user never hunts for the
new thing.

### Living-window mode

Full-screen, no interface chrome. Slow ambient motion, pollinators drifting,
light matched to real local time. This is the "watch them growing" experience.

### Wallpaper export

- PNG at exact device pixel dimensions for common iPad, iPhone and MacBook sizes.
- Cropped either to a single specimen (portrait) or the garden strip (landscape).
- SVG export for arbitrary sizes.
- No native app, no OS live wallpaper. This is a stated, accepted limitation:
  iOS live wallpapers require a Live Photo and Android live wallpapers require a
  native app. Neither is in scope.

### Motion and accessibility

- `prefers-reduced-motion` disables ambient motion and shortens reveals.
- All text scales with system settings.
- The card and garden are navigable by keyboard.
- Colour is never the sole carrier of meaning.

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

-- One garden per user in v1, but modelled as one-to-many.
create table gardens (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text,
  place_id    uuid references places(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table plantings (
  id           uuid primary key default gen_random_uuid(),
  garden_id    uuid not null references gardens(id) on delete cascade,
  seed_string  text not null,
  species_id   text,                          -- null = invented
  parent_a     uuid references plantings(id),
  parent_b     uuid references plantings(id),
  planted_at   timestamptz,                   -- null = seed in the drawer
  watered_on   date,                          -- last manual watering
  emphasis     smallint not null default 0,   -- 0..3
  footnote     text,
  memory       text,
  position     integer,
  deleted_at   timestamptz,                   -- tombstone
  updated_at   timestamptz not null default now()
);

create table weather_days (
  place_id     uuid not null references places(id) on delete cascade,
  date         date not null,
  tmin_c       real,
  tmax_c       real,
  precip_mm    real,
  sunshine_s   integer,
  weather_code smallint,
  primary key (place_id, date)
);
```

Sunrise and sunset are **not** stored. Solar position is computed on the client
from coordinates and date (§7), and having two sources for the same fact would
invite them to disagree.

### Notes

- A collected seed is a `plantings` row with `planted_at is null`. There is no
  separate seed table.
- `emphasis` is a small integer rather than a boolean so the three-level system
  is native.
- Deletes are tombstones so an offline device cannot resurrect removed flowers.
- Indexes: `plantings (garden_id, updated_at)` for delta pulls;
  `weather_days (place_id, date)` is the primary key.
- `places` needs a uniqueness rule on rounded coordinates so two gardens in the
  same city share a row; a `get_or_create_place` RPC handles this so clients
  never need broad insert rights on `places`.

---

## 11. Auth, security and RLS

### Authentication

- Email OTP via Supabase Auth. No passwords.
- **Custom SMTP is mandatory.** Supabase's built-in mailer is capped at 2 emails
  per hour for the entire project, which cannot support more than one user.
  Resend's free tier (100/day) is ample; with custom SMTP the auth email cap
  becomes 30 new users per hour.
- OTP code expiry: 10 minutes.
- **No forced re-authentication.** Sessions persist until sign-out or storage
  clearing.
- Open signup, with **Cloudflare Turnstile CAPTCHA on the OTP request** from day
  one. That endpoint sends mail to an address a stranger typed, which is the
  shape of a spam relay.

### RLS

RLS is enabled on every table in `public`. Policies follow the ownership pattern,
using `TO authenticated` **with** an explicit ownership predicate, and updates
carry both `USING` and `WITH CHECK` so a row's owner can never be reassigned.

- `gardens`: `owner_id = (select auth.uid())`
- `plantings`: `garden_id in (select id from gardens where owner_id = (select auth.uid()))`
- `places`: readable by all authenticated users; writes only through the
  `get_or_create_place` RPC (SECURITY INVOKER)
- `weather_days`: readable by all authenticated users; written only by the cron
  using the service role

Additional rules:

- No authorization decision reads `user_metadata`; it is user-editable.
- The service role key is never present in client code or in any `VITE_`-prefixed
  environment variable.
- Views, if any, are created `WITH (security_invoker = true)`.
- `supabase db advisors` runs before every migration is committed, and
  `get_advisors` is checked after deploys.

### Free-plan limitations, and the mitigations

| Limitation | Mitigation |
|---|---|
| Projects pause after 7 days of low activity | Daily cron generates activity; and local-first means a pause degrades to "sync unavailable", not data loss |
| No downloadable database backups | Daily cron dumps every garden to JSON in Supabase Storage, retaining ~30 days |
| Auth email cap of 2/hour on the built-in mailer | Custom SMTP |

---

## 12. Sync and offline

**Local IndexedDB is the source of truth for the UI.** The server is a durable
mirror so a garden survives a lost device.

The conflict surface is small by construction, because nothing dynamic is stored
(see §5 and §6) and no synced field is a counter that decreases.

| Operation | Merge rule | Loss risk |
|---|---|---|
| Plant a seed | Union by uuid | None |
| Water | `max(watered_on)` | None; the daily cap applies to the merged value |
| Emphasis, footnote, memory, name | Last write wins on the field | Only if the same field is edited on two devices while both are offline |
| Position | Last write wins | As above, rare |
| Delete | Tombstone always wins | None |
| Growth, pollinator visits, seed availability, rain-watering | Derived, never synced | None |

Mechanics: pull rows where `updated_at > last_pull_at` for the garden; push local
dirty rows by upsert. Sync fires on app open, on regaining connectivity, and
after each change. Supabase Realtime to push changes between a user's devices is
optional and not required for correctness.

Failure is always quiet. A failed sync shows a calm, non-alarming line such as
"saved on this device", never a red error.

### Clock skew

Derived state depends on local `now`. Skew of seconds or minutes is irrelevant at
a scale of days. `planted_at` is written once and never recomputed, so growth
cannot drift.

---

## 13. Operations

One daily cron function on Vercel does three jobs:

1. **Keep-warm.** A few requests against Postgres, to stay clear of the free-plan
   pause. Exact cadence beyond one run per day depends on Vercel's free-tier cron
   granularity, which must be confirmed at implementation time.
2. **Weather cache.** For every distinct place in `places`, fetch daily weather
   from Open-Meteo and upsert into `weather_days`. Requests carry coordinates
   only, no identifiers.
3. **Backups.** Dump every garden, with its plantings, to a dated JSON object in
   Supabase Storage. Retain roughly 30 days.

A garden is also exportable and importable as a single file from within the app,
independent of the server. This is the user-facing guarantee that the garden
outlives the service.

---

## 14. Privacy

- No analytics, no third-party scripts other than Turnstile, no advertising.
- The only personal data held is an email address and a chosen place.
- User devices never contact Open-Meteo; only the server does.
- Weather requests carry coordinates and nothing else.
- **The private research this design is based on must never be committed to this
  repository.** No quotes, profiles or personal details from it belong in any
  tracked file. If evidence notes are kept in the repo directory for reference,
  they must be added to `.gitignore` and never pushed. This matters more than
  usual because the app is intended to become publicly reachable.
- Recommended `.gitignore` entries: `.DS_Store`, `.gstack/`, and any local
  evidence or research files.

---

## 15. Build order

The risk is concentrated in the art. Nothing downstream is worth building until
the flowers are good.

| Milestone | Content | Gate |
|---|---|---|
| **M0** | Engine: seed → genome → strokes. Four species. Specimen gallery sheet rendered from Node, exercising the engine directly, including free seeds | **Art gate:** each species is recognisable without a label, and invented flowers are beautiful |
| **M1** | Renderer, growth reveal, specimen card | Growth is legible and the card is beautiful when empty |
| **M2** | PWA shell, sealed-envelope onboarding, IndexedDB, seed drawer, planting and watering | Works fully offline |
| **M3** | Supabase project, schema, RLS, email OTP with Turnstile, custom SMTP, sync | RLS proven by test; two devices converge |
| **M4** | Solar lighting, weather cache, the daily cron (all three jobs) | Offline fallback verified; cron verified in production |
| **M5** | Garden landscape scroll, living-window mode, wallpaper and SVG export | Exports at exact device sizes |
| **M6** | Pollinators, pollination, breeding, invented flowers | Two devices compute identical visits |
| **Later** | Trees, hemisphere-aware seasons, optional weather-affected growth | — |

**The first account is the gift.** Her garden opens with a flower grown from a
seed string that is her own name, and the envelope reveal (§16) is hers before
anyone else's.

### Onboarding

First visit is a sealed envelope bearing the user's name. Opening it plays the
bee-and-petals reveal drawing itself stroke by stroke, then enters the garden.
The envelope appears once per user, never re-seals, carries no badge, and remains
reopenable from a quiet corner of the app for anyone who wants to see it again.

Every user's first flower is grown from their own name. This gives a new garden
something unambiguously personal without the product making any claim about
anyone.

---

## 16. Testing

| Area | Approach |
|---|---|
| Engine determinism | Golden-file tests: a fixed list of seed strings must produce byte-identical polylines across runs in the same engine. Across engines (Node vs browser), comparison is tolerance-based, since transcendental functions are not bit-identical between V8 and JavaScriptCore. The 1e-3 output quantisation in §4 is what makes this safe |
| Cross-device agreement | Derived-state tests: given an identical garden document and timestamp, growth, visits and seed availability are identical |
| Growth math | Unit tests for stage boundaries, monotonic water bonus, and that no input can make a prediction later |
| Solar math | Unit tests against known sunrise/sunset values for several latitudes and dates |
| Sync merge | Table-driven tests over the merge rules in §12, including tombstone-wins and last-write-wins |
| RLS | Tests proving user A cannot select, update or delete user B's gardens or plantings, and cannot reassign ownership |
| Export | The exported garden file round-trips to an identical garden |
| Visual | The specimen gallery is regenerated and reviewed on every engine change |
| Accessibility | Reduced-motion, keyboard navigation, text scaling, and meaning-not-by-colour checks |

---

## 17. Explicitly out of scope

No AI of any kind. No streaks, guilt, decay or death. No accounts, ads, analytics
or recommendation. No notifications. No leaderboards. No public garden or social
features. No caterpillars. No live wallpapers or native apps. No in-jokes or
references to the intended first user inside the product. No claims about what
any user likes. No silent changes to something a user has grown used to.

---

## 18. Open questions

1. **Product name.** Working title "Ink Garden"; "Paper Garden" is the
   alternative. The PWA manifest requires a name, so this must be settled before
   M2.
2. **Trees.** Coconut, mango and avocado are landscape-scale and need the scroll
   view to exist first. Confirm they are wanted after M5.
3. **Weather-affected growth.** Rejected for v1 on predictability grounds. If
   wanted later, it should be a deliberate, clearly-labelled opt-in, not a
   default.
4. **Multiple gardens per user.** The schema permits it; v1 should ship one.
5. **Cron granularity on Vercel's free tier.** Needs confirming at M4; if it is
   limited to once daily, the keep-warm ping fires several requests in that one
   run.
6. **Realtime between a user's devices.** Nice to have, not required. Decide at
   M3.
