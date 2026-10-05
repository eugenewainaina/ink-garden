# M0a — Engine Core Implementation Plan

> ## STATUS: EXECUTED. Do not follow this plan to write new code.
>
> M0a was built from this plan and merged to `main`. **The code and its tests are
> now the source of truth**, not this document. It is kept because the reasoning
> and the task decomposition are still useful, and because the corrections below
> are a record of what building it taught us.
>
> Several steps in here are **known wrong**. They are listed rather than edited
> out, because the pattern of what went wrong is more valuable than a tidy plan:
> a full surgical rewrite would produce a document describing code that already
> exists, which nobody should follow either.
>
> ### What building this changed
>
> | The plan said | The truth | Caught by |
> |---|---|---|
> | `secondaryWeight = (1 - blend) / 2` | `blend / 2`. The formula was **inverted**: it gave 0.5 at complete dominance and 0 at codominance, the opposite of the documented meaning | tests |
> | Incomplete dominance gives `secondaryWeight` 0.5 | 0.25. The test contradicted its own name | tests |
> | Round-trip test generated alleles `i % 2` and `(i + 1) % 3` | Allele 2 is invalid at two-allele loci. Tests now derive valid alleles from each locus | test failure |
> | `leaf.form: [0,1,0,0,0]` asserted as allele 2 (bipinnate) | Distribution index **is** allele index, so it selects allele 1 | test failure |
> | `habit.height` as a single locus | Split into `.a` and `.b`. Two species templates also referenced a non-existent `habit.height.a` | plan self-review |
> | `petal.count.a/.b` as polygenic loci, range 0 to 2.3 | **Petal number is canalised, not polygenic.** It comes from the species baseline; `petal.variance` is silent cryptic variation gated by `flower.canalisation` | research |
> | `defaultDistribution` uniform | Architecture-aware: canalised 0.99, polymorphic 0.5, homeotic 0.96 | research, then output inspection |
> | Doubling multiplied petal count by 1.9, test expected 10 | 9.5 for the test, and the petal multiplication moved out of epistasis into `expressPlant` so the factor exists once | tests |
> | One `colour.petal.chlorophyll` rule | Two: pure green only when it is the sole pigment, otherwise chlorophyll absorbs and darkens. The single rule was clobbering anthocyanin and carotenoid, turning 10 of 14 wild flowers green | **output inspection** |
> | Species templates had no size scale | `PhenotypeBaseline` with nine fields, and `expressPlant` to apply it | research |
> | `thermalBase`/`thermalConstant` on the template | Moved into the baseline. It was two sources for one fact, the same error already removed from the spec for sunrise and sunset | **output inspection** |
> | No notion of trait architecture | 11 canalised, 10 polymorphic, 5 homeotic | research |
> | Reference allele implicitly index 0 | An explicit `referenceAllele`. Without it **every** plant in a sample of sixteen came out decanalised | **output inspection** |
> | 78 loci | 79: 26 discrete, 53 quantitative, 34 distinct traits | count |
>
> **The lesson worth keeping:** four of these were caught by tests, five by
> reading published biology, and **four only by looking at real generated
> output**. A passing test suite is not evidence that the output is plausible.
> Run the CLIs and read the numbers before believing anything.
>
> The catalogue also grew a `traitMaximum` helper and a distinct
> `express` / `expressPlant` split; both postdate the tasks below.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, deterministic genetics core of the Ink Garden engine: a seed string becomes a genome, a genome becomes a phenotype, and two genomes produce a child genome.

**Architecture:** A dependency-free, isomorphic TypeScript module in `packages/engine`. Three layers kept strictly separate: **genotype** (diploid allele pairs) → `express()` → **phenotype** (discrete traits resolved through a blend coefficient, plus polygenic quantitative traits, plus an epistasis rule table) → `reproduce()` (meiosis, independent assortment, mutation) back to a genotype. Nothing here touches geometry, time or weather; those are M0b. All randomness is integer-only so that genomes are bit-identical across JavaScript engines.

**Tech Stack:** TypeScript 5.8+ with `erasableSyntaxOnly` and `verbatimModuleSyntax`, pnpm workspaces, Vitest. Node 24 runs the `.ts` files directly by stripping types; Bun runs them too, for the JavaScriptCore cross-check.

**Spec:** `docs/superpowers/specs/2026-10-03-flower-garden-design.md` (revision 4). Read §4 in full before starting, and §3 for the three-layer diagram.

## Global Constraints

- **No runtime dependencies in `packages/engine`.** Dev dependencies are fine; `dependencies` must stay empty. Copy the exact values below.
- **`erasableSyntaxOnly: true` and `verbatimModuleSyntax: true`.** This bans `enum`, runtime `namespace`, parameter properties, import aliases and decorators. Use `const` objects plus union types instead of `enum`. Import types with `import type`.
- **Explicit `.ts` extensions in all relative imports**, e.g. `import { hash32 } from './rng.ts'`. Node's type stripping requires this and ignores `tsconfig` paths.
- **All randomness is integer-only.** Use `Math.imul`, `>>>`, `^` and `>>> 0`. Never use `Math.random`, `Math.sin`, `Math.cos`, `Math.pow` or floating-point accumulation to derive an allele. The reason: `Math.sin` and friends are not required to be correctly rounded and V8 and JavaScriptCore differ in the last bits (spec §16). Keeping the RNG integer-only makes **genomes bit-identical across engines**, and confines float divergence to geometry in M0b where it is quantised to 1e-3.
- **Determinism is absolute.** The same inputs must produce the same output forever, on every device. No `Date.now()`, no locality, no iteration over unordered maps when order affects a result.
- **`tsc --noEmit` must pass.** Node and Bun strip types without checking them, so this is the only thing verifying types.
- **`pnpm test` must pass** in `packages/engine` at the end of every task.
- **Node >= 24, pnpm >= 10.** Verified on Node v24.10.0 / pnpm 10.7.0.
- Do not add the `noUncheckedIndexedAccess` escape hatch of casting arrays. Use the `locusAt` helper defined in Task 2.

## File Structure

```
package.json                       root, private, workspace scripts
pnpm-workspace.yaml                workspace globs
tsconfig.base.json                 shared strict compiler options
packages/engine/
  package.json                     @ink-garden/engine, no dependencies
  tsconfig.json                    extends base
  vitest.config.ts                 test discovery
  README.md                        the engine's public API
  src/
    rng.ts                         hash32, rngFrom, pickWeighted
    loci.ts                        locus types, LOCI catalogue, index helpers
    species.ts                     SpeciesTemplate type, defaultDistribution, 4 species
    genome.ts                      Genome type, id, serialise, migrate, founderGenome
    phenotype.ts                   DiscreteTrait, Phenotype, resolveDiscrete, express
    epistasis.ts                   EpistasisRule, EPISTASIS table, applyEpistasis
    reproduce.ts                   meiosis, mutateAllele, reproduce
    index.ts                       public API barrel
    cli/
      dump.ts                      genome + phenotype for one seed
      descendants.ts               breeding statistics over many generations
  test/
    rng.test.ts
    loci.test.ts
    genome.test.ts
    species.test.ts
    phenotype.test.ts
    epistasis.test.ts
    reproduce.test.ts
    cli.test.ts
```

Each `src` file has one responsibility. `phenotype.ts` imports `applyEpistasis` from `epistasis.ts`, and `epistasis.ts` imports **only types** from `phenotype.ts`, so the dependency is erased at runtime and there is no cycle.

---

### Task 1: Scaffold the workspace and the deterministic RNG

The RNG is the foundation of every determinism claim in the product, so it is the first real code and the harness is folded into this task because the RNG test needs it.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/vitest.config.ts`
- Create: `packages/engine/src/rng.ts`
- Test: `packages/engine/test/rng.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `hash32(s: string): number`, `rngFrom(seed: string): () => number`, `pickWeighted(weights: readonly number[], r: number): number`

- [ ] **Step 1: Create the workspace files**

`package.json` (root):

```json
{
  "name": "ink-garden",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "esnext",
    "lib": ["esnext"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

`packages/engine/package.json`:

```json
{
  "name": "@ink-garden/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "dump": "node src/cli/dump.ts",
    "dump:bun": "bun src/cli/dump.ts",
    "descendants": "node src/cli/descendants.ts"
  }
}
```

`packages/engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/engine/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
})
```

- [ ] **Step 2: Install tooling and record resolved versions**

Resolve latest rather than pinning by guesswork, then commit the lockfile so the resolved versions are pinned from here on.

```bash
pnpm add -D -w typescript vitest @types/node
pnpm install
```

Expected: `pnpm-lock.yaml` created. `packages/engine/package.json` must have **no** `dependencies` key.

- [ ] **Step 3: Write the failing RNG test**

`packages/engine/test/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hash32, pickWeighted, rngFrom } from '../src/rng.ts'

describe('hash32', () => {
  it('is deterministic for the same input', () => {
    expect(hash32('rosemary')).toBe(hash32('rosemary'))
  })

  it('returns an unsigned 32-bit integer', () => {
    for (const s of ['', 'a', 'rosemary', 'Jacaranda mimosifolia', '✮']) {
      const h = hash32(s)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(2 ** 32)
    }
  })

  it('separates similar inputs', () => {
    expect(hash32('Amara')).not.toBe(hash32('Amara '))
    expect(hash32('a')).not.toBe(hash32('b'))
  })
})

describe('rngFrom', () => {
  it('produces the same sequence for the same seed, forever', () => {
    const a = rngFrom('Lupin')
    const b = rngFrom('Lupin')
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 8 }, rngFrom('Amara'))
    const b = Array.from({ length: 8 }, rngFrom('Kofi'))
    expect(a).not.toEqual(b)
  })

  it('stays within [0, 1)', () => {
    const r = rngFrom('bounds')
    for (let i = 0; i < 1000; i += 1) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is roughly uniform', () => {
    const r = rngFrom('uniform')
    const buckets = new Array<number>(10).fill(0)
    const n = 20_000
    for (let i = 0; i < n; i += 1) {
      const idx = Math.floor(r() * 10)
      buckets[idx] = (buckets[idx] ?? 0) + 1
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 - n / 50)
      expect(count).toBeLessThan(n / 10 + n / 50)
    }
  })
})

describe('pickWeighted', () => {
  it('selects by cumulative weight', () => {
    expect(pickWeighted([1, 0, 0], 0.0)).toBe(0)
    expect(pickWeighted([1, 0, 0], 0.99)).toBe(0)
    expect(pickWeighted([0, 1, 0], 0.5)).toBe(1)
    expect(pickWeighted([0, 0, 1], 0.999)).toBe(2)
  })

  it('respects relative weights', () => {
    const counts = [0, 0]
    const r = rngFrom('weights')
    for (let i = 0; i < 10_000; i += 1) {
      const idx = pickWeighted([0.25, 0.75], r())
      counts[idx] = (counts[idx] ?? 0) + 1
    }
    expect(counts[0]).toBeGreaterThan(2200)
    expect(counts[0]).toBeLessThan(2800)
  })

  it('handles an unnormalised distribution', () => {
    expect(pickWeighted([3, 1], 0.7)).toBe(0)
    expect(pickWeighted([3, 1], 0.8)).toBe(1)
  })

  it('returns the last index when r is at the top of the range', () => {
    expect(pickWeighted([0.5, 0.5], 0.999999)).toBe(1)
  })

  it('throws on an all-zero distribution', () => {
    expect(() => pickWeighted([0, 0], 0.5)).toThrow(/zero/i)
  })
})
```

- [ ] **Step 4: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test`
Expected: FAIL. `Failed to resolve import "../src/rng.ts"`.

- [ ] **Step 5: Implement the RNG**

`packages/engine/src/rng.ts`:

```ts
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
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS, 12 tests. Typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json packages/engine
git commit -m "feat(engine): workspace scaffold and integer-only deterministic RNG"
```

---

### Task 2: The locus catalogue

Species are data, not code. This task defines what a locus *is* and the catalogue the rest of the engine reads.

**Files:**
- Create: `packages/engine/src/loci.ts`
- Test: `packages/engine/test/loci.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `LocusKind`, `DiscreteLocus`, `QuantitativeLocus`, `Locus`, `LOCI`, `LOCUS_INDEX`, `locusAt(index)`, `locusById(id)`, `locusIndex(id)`, `quantitativeTraits()`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/loci.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  LOCI,
  LOCUS_INDEX,
  locusAt,
  locusById,
  locusIndex,
  quantitativeTraits,
} from '../src/loci.ts'

describe('the locus catalogue', () => {
  it('has unique ids', () => {
    const ids = LOCI.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('indexes every locus at its array position', () => {
    expect(LOCUS_INDEX.size).toBe(LOCI.length)
    LOCI.forEach((locus, i) => {
      expect(locusIndex(locus.id)).toBe(i)
      expect(locusAt(i)).toBe(locus)
    })
  })

  it('gives every discrete locus at least two named alleles', () => {
    for (const locus of LOCI) {
      if (locus.kind !== 'discrete') continue
      expect(locus.alleles.length).toBeGreaterThanOrEqual(2)
      expect(new Set(locus.alleles).size).toBe(locus.alleles.length)
    }
  })

  it('keeps blend and mutation inside their ranges', () => {
    for (const locus of LOCI) {
      if (locus.kind === 'discrete') {
        expect(locus.blend).toBeGreaterThanOrEqual(0)
        expect(locus.blend).toBeLessThanOrEqual(1)
      }
      expect(locus.mutation).toBeGreaterThanOrEqual(0)
      expect(locus.mutation).toBeLessThan(1)
    }
  })

  it('gives every quantitative locus a trait and a non-zero weight', () => {
    for (const locus of LOCI) {
      if (locus.kind !== 'quantitative') continue
      expect(locus.trait.length).toBeGreaterThan(0)
      expect(locus.weight).not.toBe(0)
    }
  })

  it('covers the modules the spec requires', () => {
    const ids = LOCI.map((l) => l.id)
    for (const required of [
      'flower.doubling',
      'flower.symmetry',
      'inflorescence.type',
      'leaf.form',
      'thorn.presence',
      'pigment.anthocyanidin',
      'pigment.carotenoid',
      'pigment.petal.chlorophyll',
      'photoperiod.response',
      'lifecycle',
    ]) {
      expect(ids).toContain(required)
    }
  })

  it('lists each quantitative trait once', () => {
    const traits = quantitativeTraits()
    expect(new Set(traits).size).toBe(traits.length)
    expect(traits).toContain('petal.count')
    expect(traits).toContain('height')
  })

  it('throws on an unknown locus', () => {
    expect(() => locusById('does.not.exist')).toThrow(/unknown locus/i)
    expect(() => locusAt(9999)).toThrow(/no locus/i)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test loci`
Expected: FAIL. `Failed to resolve import "../src/loci.ts"`.

- [ ] **Step 3: Implement the catalogue**

`packages/engine/src/loci.ts`:

```ts
export type LocusKind = 'discrete' | 'quantitative'

/**
 * A discrete locus. Allele order is the dominance series: under complete
 * dominance (blend 0) the higher index always wins.
 */
export interface DiscreteLocus {
  readonly id: string
  readonly kind: 'discrete'
  readonly alleles: readonly string[]
  /** 0 = complete dominance, 1 = codominance, between = incomplete. */
  readonly blend: number
  /** Probability per copy of mutating on a cross. */
  readonly mutation: number
}

/** A quantitative locus contributing `weight` per copy carrying allele 1. */
export interface QuantitativeLocus {
  readonly id: string
  readonly kind: 'quantitative'
  readonly trait: string
  readonly weight: number
  readonly mutation: number
}

export type Locus = DiscreteLocus | QuantitativeLocus

const d = (
  id: string,
  alleles: readonly string[],
  blend: number,
  mutation = 0.004,
): DiscreteLocus => ({ id, kind: 'discrete', alleles, blend, mutation })

const q = (
  id: string,
  trait: string,
  weight: number,
  mutation = 0.004,
): QuantitativeLocus => ({ id, kind: 'quantitative', trait, weight, mutation })

/**
 * The catalogue, in locus order. A genome's allele array is parallel to this.
 * Adding a locus is a one-line change, and migrateGenome fills it for
 * existing plants deterministically.
 *
 * This is a first pass and is expected to grow as the four founding species
 * are tuned at M0c. Counts: 25 discrete, 53 quantitative.
 */
export const LOCI: readonly Locus[] = [
  // Master identity
  d('flower.organ.identity', ['normal', 'sepals.petaloid'], 1),
  d('flower.doubling', ['single', 'double'], 1),
  d('flower.symmetry', ['actinomorphic', 'zygomorphic'], 1),
  d('inflorescence.type', ['solitary', 'spike', 'raceme', 'panicle', 'umbel', 'corymb', 'head', 'cyme'], 1),
  d('leaf.form', ['simple', 'pinnate', 'bipinnate', 'palmate', 'cordate'], 1),

  // Habit and stem
  d('habit.determinacy', ['determinate', 'indeterminate'], 0.5),
  d('phyllotaxis.pattern', ['alternate', 'decussate', 'whorled', 'spiral'], 1),
  d('stem.pigment', ['green', 'red.brown'], 0.5),
  d('stem.pubescence', ['glabrous', 'pubescent'], 1),
  q('habit.height.a', 'height', 0.09),
  q('habit.height.b', 'height', 0.06),
  q('internode.length.a', 'internode.length', 0.11),
  q('internode.length.b', 'internode.length', 0.07),
  q('stem.thickness.a', 'stem.thickness', 0.04),
  q('stem.thickness.b', 'stem.thickness', 0.02),
  q('branch.angle.a', 'branch.angle', 0.08),
  q('branch.angle.b', 'branch.angle', 0.05),
  q('branch.count.a', 'branch.count', 0.6),
  q('branch.count.b', 'branch.count', 0.35),
  q('branch.apical_dominance.a', 'branch.apical_dominance', 0.09),
  q('branch.apical_dominance.b', 'branch.apical_dominance', 0.06),

  // Leaf
  d('leaf.margin', ['entire', 'serrate', 'dentate', 'lobed'], 1),
  d('leaf.venation', ['pinnate', 'palmate', 'parallel'], 1),
  d('leaf.variegation', ['none', 'marginal', 'splashed', 'striped'], 0),
  d('leaf.pubescence', ['glabrous', 'pubescent'], 1),
  q('leaf.length.a', 'leaf.length', 0.5),
  q('leaf.length.b', 'leaf.length', 0.28),
  q('leaf.width.a', 'leaf.width', 0.22),
  q('leaf.width.b', 'leaf.width', 0.13),
  q('leaf.petiole', 'leaf.petiole', 0.18),
  q('leaf.gloss', 'leaf.gloss', 0.06),

  // Armature
  d('thorn.presence', ['thornless', 'thorned'], 1),
  q('thorn.density.a', 'thorn.density', 0.5),
  q('thorn.density.b', 'thorn.density', 0.32),
  q('thorn.curvature', 'thorn.curvature', 0.07),
  q('thorn.length', 'thorn.length', 0.16),

  // Flower
  d('petal.shape', ['rounded', 'obovate', 'spatulate', 'ligulate', 'clawed'], 1),
  d('petal.margin', ['entire', 'ruffled', 'fringed', 'notched'], 0.5),
  d('flower.throat', ['open', 'tubular', 'spurred'], 1),
  d('nectar_guide', ['absent', 'present'], 1),
  q('flower.diameter.a', 'flower.diameter', 0.55),
  q('flower.diameter.b', 'flower.diameter', 0.34),
  q('petal.count.a', 'petal.count', 0.7),
  q('petal.count.b', 'petal.count', 0.45),
  q('petal.length.a', 'petal.length', 0.3),
  q('petal.length.b', 'petal.length', 0.19),
  q('petal.width', 'petal.width', 0.15),
  q('petal.curl', 'petal.curl', 0.08),
  q('petal.overlap', 'petal.overlap', 0.1),
  q('petal.substance', 'petal.substance', 0.1),

  // Pigment
  d('pigment.anthocyanidin', ['none', 'pelargonidin', 'cyanidin', 'delphinidin'], 1),
  d('pigment.carotenoid', ['none', 'yellow', 'orange', 'red'], 1),
  d('pigment.petal.chlorophyll', ['none', 'green'], 1),
  d('pigment.pattern', ['solid', 'gradient', 'picotee', 'blotch', 'speckled'], 0.5),
  q('pigment.intensity.a', 'pigment.intensity', 0.4),
  q('pigment.intensity.b', 'pigment.intensity', 0.25),
  q('pigment.intensity.c', 'pigment.intensity', 0.15),
  q('pigment.copigment.a', 'pigment.copigment', 0.4),
  q('pigment.copigment.b', 'pigment.copigment', 0.22),
  q('pigment.vacuolar.ph.a', 'pigment.vacuolar.ph', 0.4),
  q('pigment.vacuolar.ph.b', 'pigment.vacuolar.ph', 0.24),
  q('pigment.cold.response', 'pigment.cold.response', 0.3),
  q('pigment.gradient_extent', 'pigment.gradient_extent', 0.3),
  q('pigment.tip_shift', 'pigment.tip_shift', 0.2),

  // Phenology
  d('photoperiod.response', ['day.neutral', 'short.day', 'long.day'], 1),
  d('vernalization.required', ['none', 'required'], 1),
  q('thermal.base_temp.a', 'thermal.base_temp', 2.5),
  q('thermal.base_temp.b', 'thermal.base_temp', 1.5),
  q('thermal.constant.a', 'thermal.constant', 90),
  q('thermal.constant.b', 'thermal.constant', 55),
  q('thermal.constant.c', 'thermal.constant', 30),
  q('photoperiod.critical', 'photoperiod.critical', 0.6),
  q('vernalization.hours', 'vernalization.hours', 80),
  q('dormancy.depth', 'dormancy.depth', 0.35),
  q('senescence.rate', 'senescence.rate', 0.25),

  // Lifecycle and allocation
  d('lifecycle', ['annual', 'biennial', 'perennial'], 0),
  q('allocation.root_shoot', 'allocation.root_shoot', 0.15),
  q('allocation.leaf_vs_stem', 'allocation.leaf_vs_stem', 0.15),
]

export const LOCUS_INDEX: ReadonlyMap<string, number> = new Map(
  LOCI.map((locus, index) => [locus.id, index]),
)

export function locusAt(index: number): Locus {
  const locus = LOCI[index]
  if (locus === undefined) throw new Error(`No locus at index ${index}`)
  return locus
}

export function locusIndex(id: string): number {
  const index = LOCUS_INDEX.get(id)
  if (index === undefined) throw new Error(`Unknown locus: ${id}`)
  return index
}

export function locusById(id: string): Locus {
  return locusAt(locusIndex(id))
}

let cachedTraits: readonly string[] | undefined

/** The sorted, de-duplicated list of quantitative trait names. */
export function quantitativeTraits(): readonly string[] {
  if (cachedTraits === undefined) {
    const found = new Set<string>()
    for (const locus of LOCI) {
      if (locus.kind === 'quantitative') found.add(locus.trait)
    }
    cachedTraits = [...found].sort()
  }
  return cachedTraits
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test loci && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/loci.ts packages/engine/test/loci.test.ts
git commit -m "feat(engine): locus catalogue with blend coefficient and index helpers"
```

---

### Task 3: Genome type, identity, serialisation and versioning

**Files:**
- Create: `packages/engine/src/genome.ts` (type, id, serialise, migrate only in this task)
- Test: `packages/engine/test/genome.test.ts`

**Interfaces:**
- Consumes: `LOCI`, `locusAt`, `locusIndex`, `Locus` from `./loci.ts`; `hash32`, `rngFrom`, `pickWeighted` from `./rng.ts`
- Produces: `GENOME_VERSION`, `Allele`, `Genome`, `createGenome(alleles)`, `allelePair(genome, locusId)`, `genomeId(genome)`, `serialiseGenome(genome)`, `deserialiseGenome(json)`, `migrateGenome(genome)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/genome.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  GENOME_VERSION,
  createGenome,
  deserialiseGenome,
  genomeId,
  migrateGenome,
  serialiseGenome,
  allelePair,
  type Genome,
} from '../src/genome.ts'
import { LOCI } from '../src/loci.ts'

const half = (): Genome =>
  createGenome(LOCI.map(() => [0, 0] as const))

describe('genome identity', () => {
  it('is stable for the same alleles', () => {
    expect(genomeId(half())).toBe(genomeId(half()))
  })

  it('changes when a single allele changes', () => {
    const a = half()
    const other = createGenome(LOCI.map((_, i) => (i === 3 ? [0, 1] as const : [0, 0] as const)))
    expect(genomeId(a)).not.toBe(genomeId(other))
  })

  it('is order sensitive', () => {
    const a = createGenome(LOCI.map((_, i) => (i === 0 ? [1, 0] as const : [0, 0] as const)))
    const b = createGenome(LOCI.map((_, i) => (i === 0 ? [0, 1] as const : [0, 0] as const)))
    expect(genomeId(a)).not.toBe(genomeId(b))
  })
})

describe('genome serialisation', () => {
  it('round-trips', () => {
    const g = createGenome(LOCI.map((_, i) => [i % 2, (i + 1) % 3] as const))
    const back = deserialiseGenome(serialiseGenome(g))
    expect(back).toEqual(g)
    expect(genomeId(back)).toBe(genomeId(g))
  })

  it('is stable text, not key-order dependent', () => {
    const g = half()
    expect(serialiseGenome(deserialiseGenome(serialiseGenome(g)))).toBe(serialiseGenome(g))
  })

  it('rejects a genome whose allele count exceeds the catalogue', () => {
    const tooLong = JSON.stringify({
      v: GENOME_VERSION,
      a: [...LOCI.map(() => [0, 0]), [0, 0]],
    })
    expect(() => deserialiseGenome(tooLong)).toThrow(/too many loci/i)
  })

  it('rejects an allele index outside the locus', () => {
    const bad = createGenome(LOCI.map(() => [0, 0] as const))
    const alleles = LOCI.map((locus, i) =>
      i === 0 ? [0, locus.kind === 'discrete' ? locus.alleles.length : 1] : [0, 0],
    )
    const json = JSON.stringify({ ...JSON.parse(serialiseGenome(bad)), a: alleles })
    expect(() => deserialiseGenome(json)).toThrow(/invalid allele/i)
  })
})

describe('genome migration', () => {
  it('fills missing loci deterministically from the genome itself', () => {
    const short = createGenome(LOCI.slice(0, 4).map(() => [0, 0] as const))
    const first = migrateGenome(short)
    const second = migrateGenome(short)
    expect(first.alleles.length).toBe(LOCI.length)
    expect(second).toEqual(first)
  })

  it('is idempotent', () => {
    const short = createGenome(LOCI.slice(0, 4).map(() => [0, 0] as const))
    const once = migrateGenome(short)
    expect(migrateGenome(once)).toEqual(once)
  })

  it('preserves existing alleles exactly', () => {
    const short = createGenome(LOCI.slice(0, 4).map(() => [1, 1] as const))
    const migrated = migrateGenome(short)
    expect(allelesOf(migrated).slice(0, 4)).toEqual([
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ])
  })

  it('stamps the current version', () => {
    const short = createGenome(LOCI.slice(0, 2).map(() => [0, 0] as const))
    expect(migrateGenome(short).version).toBe(GENOME_VERSION)
  })
})

describe('allelePair', () => {
  it('reads the pair for a named locus', () => {
    const g = createGenome(LOCI.map((_, i) => (i === 1 ? [1, 0] as const : [0, 0] as const)))
    expect(allelePair(g, LOCI[1]?.id ?? '')).toEqual([1, 0])
  })
})

function allelesOf(g: Genome): number[][] {
  return g.alleles.map((pair) => [pair[0], pair[1]])
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test genome`
Expected: FAIL. `Failed to resolve import "../src/genome.ts"`.

- [ ] **Step 3: Implement genome.ts**

`packages/engine/src/genome.ts`:

```ts
import { LOCI, locusAt, locusIndex, type Locus } from './loci.ts'
import { hash32, pickWeighted, rngFrom } from './rng.ts'

export const GENOME_VERSION = 1

export type Allele = number

/** Diploid: one [copyA, copyB] pair per locus, parallel to LOCI. */
export interface Genome {
  readonly version: number
  readonly alleles: readonly (readonly [Allele, Allele])[]
}

export function createGenome(
  alleles: readonly (readonly [Allele, Allele])[],
): Genome {
  return { version: GENOME_VERSION, alleles: [...alleles] }
}

export function allelePair(
  genome: Genome,
  locusId: string,
): readonly [Allele, Allele] {
  const pair = genome.alleles[locusIndex(locusId)]
  if (pair === undefined) throw new Error(`No alleles for locus ${locusId}`)
  return pair
}

/** Allele count for a locus: named alleles, or 2 for a quantitative locus. */
function alleleCount(locus: Locus): number {
  return locus.kind === 'discrete' ? locus.alleles.length : 2
}

function assertAllele(locus: Locus, allele: Allele, where: string): void {
  if (!Number.isInteger(allele) || allele < 0 || allele >= alleleCount(locus)) {
    throw new Error(`Invalid allele ${allele} at ${where} (${locus.id})`)
  }
}

/** A stable identity for a genome, used as the salt in meiosis. */
export function genomeId(genome: Genome): string {
  let s = `v${genome.version}`
  for (const [a, b] of genome.alleles) s += `:${a}${b}`
  return hash32(s).toString(16).padStart(8, '0')
}

export function serialiseGenome(genome: Genome): string {
  return JSON.stringify({
    v: genome.version,
    a: genome.alleles.map(([a, b]) => [a, b]),
  })
}

export function deserialiseGenome(json: string): Genome {
  const parsed: unknown = JSON.parse(json)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Genome JSON is not an object')
  }
  const record = parsed as { v?: unknown; a?: unknown }
  const version = typeof record.v === 'number' ? record.v : GENOME_VERSION
  if (!Array.isArray(record.a)) throw new Error('Genome JSON has no allele array')
  if (record.a.length > LOCI.length) throw new Error('Genome has too many loci')

  const alleles = record.a.map((raw, i) => {
    if (!Array.isArray(raw) || raw.length !== 2) {
      throw new Error(`Invalid allele pair at locus ${i}`)
    }
    const locus = locusAt(i)
    const a = raw[0] as number
    const b = raw[1] as number
    assertAllele(locus, a, `copy 0`)
    assertAllele(locus, b, `copy 1`)
    return [a, b] as const
  })

  return { version, alleles }
}

/**
 * Fill loci added since a genome was created. New alleles are derived from the
 * genome's own identity, so migration is deterministic and repeatable: an old
 * plant does not change its appearance each time it is loaded.
 */
export function migrateGenome(genome: Genome): Genome {
  if (genome.alleles.length === LOCI.length && genome.version === GENOME_VERSION) {
    return genome
  }
  const alleles: (readonly [Allele, Allele])[] = genome.alleles.map((pair, i) => {
    const locus = locusAt(i)
    assertAllele(locus, pair[0], 'copy 0')
    assertAllele(locus, pair[1], 'copy 1')
    return [pair[0], pair[1]] as const
  })

  const seed = `${genomeId(genome)}|migrate`
  for (let i = alleles.length; i < LOCI.length; i += 1) {
    const locus = locusAt(i)
    const r = rngFrom(`${seed}|${locus.id}`)
    const count = alleleCount(locus)
    const a = pickWeighted(new Array<number>(count).fill(1), r())
    const b = pickWeighted(new Array<number>(count).fill(1), r())
    alleles.push([a, b] as const)
  }

  return { version: GENOME_VERSION, alleles }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test genome && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/genome.ts packages/engine/test/genome.test.ts
git commit -m "feat(engine): genome type, stable identity, validated serialisation and deterministic migration"
```

---

### Task 4: Species templates and founder expression

A species is a probability distribution over alleles per locus. Anything unspecified falls back to a default, so a species file only lists what makes it distinctive.

**Files:**
- Create: `packages/engine/src/species.ts` (type and `defaultDistribution` only)
- Modify: `packages/engine/src/genome.ts` (add `founderGenome`)
- Test: `packages/engine/test/species.test.ts`

**Interfaces:**
- Consumes: `LOCI`, `Locus` from `./loci.ts`; `rngFrom`, `pickWeighted` from `./rng.ts`; `Genome`, `createGenome` from `./genome.ts`
- Produces: `Lifecycle`, `SpeciesTemplate`, `defaultDistribution(locus)`, `founderGenome(template, seed)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/species.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { founderGenome, genomeId } from '../src/genome.ts'
import { LOCI, locusAt, locusIndex } from '../src/loci.ts'
import { defaultDistribution, type SpeciesTemplate } from '../src/species.ts'

const fixture: SpeciesTemplate = {
  id: 'fixture',
  commonName: 'Fixture',
  binomial: 'Testus fixturus',
  lineage: 'Testus',
  lifecycle: 'perennial',
  daysToBloom: 40,
  thermalBase: 5,
  thermalConstant: 700,
  distributions: {
    'thorn.presence': [0.95, 0.05],
    'leaf.form': [0, 1, 0, 0, 0],
    'petal.count.a': [0.2, 0.8],
  },
}

describe('defaultDistribution', () => {
  it('is uniform over the allele count', () => {
    const five = LOCI.find((l) => l.kind === 'discrete' && l.alleles.length === 5)
    if (five === undefined) throw new Error('expected a five-allele locus in the catalogue')
    const dist = defaultDistribution(five)
    expect(dist.length).toBe(5)
    for (const p of dist) expect(p).toBeCloseTo(0.2, 10)
  })

  it('is binary for quantitative loci', () => {
    const quant = LOCI.find((l) => l.kind === 'quantitative')
    if (quant === undefined) throw new Error('expected a quantitative locus')
    expect(defaultDistribution(quant)).toEqual([0.5, 0.5])
  })
})

describe('founderGenome', () => {
  it('is deterministic for a name and template', () => {
    const a = founderGenome(fixture, 'Amara')
    const b = founderGenome(fixture, 'Amara')
    expect(a).toEqual(b)
    expect(genomeId(a)).toBe(genomeId(b))
  })

  it('differs between names', () => {
    expect(genomeId(founderGenome(fixture, 'Amara'))).not.toBe(
      genomeId(founderGenome(fixture, 'Kofi')),
    )
  })

  it('produces one valid pair per locus', () => {
    const g = founderGenome(fixture, 'Amara')
    expect(g.alleles.length).toBe(LOCI.length)
    g.alleles.forEach((pair, i) => {
      const locus = locusAt(i)
      const count = locus.kind === 'discrete' ? locus.alleles.length : 2
      for (const allele of pair) {
        expect(allele).toBeGreaterThanOrEqual(0)
        expect(allele).toBeLessThan(count)
      }
    })
  })

  it('respects explicit distributions', () => {
    let thornless = 0
    const n = 400
    for (let i = 0; i < n; i += 1) {
      const g = founderGenome(fixture, `sample-${i}`)
      const pair = g.alleles[locusIndex('thorn.presence')] ?? [0, 0]
      if (pair[0] === 0 && pair[1] === 0) thornless += 1
    }
    // p(both copies 0) = 0.95^2 = 0.9025
    expect(thornless / n).toBeGreaterThan(0.85)
    expect(thornless / n).toBeLessThan(0.95)
  })

  it('is tightly clustered for a near-deterministic locus', () => {
    let bipinnate = 0
    const n = 400
    for (let i = 0; i < n; i += 1) {
      const g = founderGenome(fixture, `leaf-${i}`)
      const pair = g.alleles[locusIndex('leaf.form')] ?? [0, 0]
      if (pair[0] === 2 && pair[1] === 2) bipinnate += 1
    }
    expect(bipinnate).toBe(n)
  })

  it('falls back to a default for unspecified loci', () => {
    let sawOne = false
    let sawZero = false
    for (let i = 0; i < 200 && !(sawOne && sawZero); i += 1) {
      const g = founderGenome(fixture, `fallback-${i}`)
      const pair = g.alleles[locusIndex('flower.doubling')] ?? [0, 0]
      if (pair[0] === 1 || pair[1] === 1) sawOne = true
      if (pair[0] === 0 || pair[1] === 0) sawZero = true
    }
    expect(sawOne).toBe(true)
    expect(sawZero).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test species`
Expected: FAIL. `Failed to resolve import "../src/species.ts"`.

- [ ] **Step 3: Implement the species type**

`packages/engine/src/species.ts`:

```ts
import type { Locus } from './loci.ts'

export type Lifecycle = 'annual' | 'biennial' | 'perennial'

/**
 * A species is a distribution over alleles per locus. Loci not listed fall
 * back to `defaultDistribution`, so a species file only needs to state what
 * makes it distinctive.
 */
export interface SpeciesTemplate {
  readonly id: string
  readonly commonName: string
  readonly binomial: string
  /** Genus label used for cultivar naming, e.g. 'Rosa'. */
  readonly lineage: string
  readonly lifecycle: Lifecycle
  /** Nominal days to bloom at a mild temperature. Phenology proper is M0b. */
  readonly daysToBloom: number
  /** Base temperature for thermal time, in Celsius. */
  readonly thermalBase: number
  /** Thermal constant: growing degree days from germination to bloom. */
  readonly thermalConstant: number
  readonly distributions: Readonly<Record<string, readonly number[]>>
}

/**
 * The fallback when a species does not specify a locus. Uniform over the
 * allele count, so an unspecified trait is maximally variable. Species that
 * care must therefore say so, which is the intended pressure.
 */
export function defaultDistribution(locus: Locus): readonly number[] {
  const count = locus.kind === 'discrete' ? locus.alleles.length : 2
  return new Array<number>(count).fill(1 / count)
}
```

- [ ] **Step 4: Add founderGenome to genome.ts**

Append to `packages/engine/src/genome.ts`:

```ts
import {
  defaultDistribution,
  type SpeciesTemplate,
} from './species.ts'

/**
 * Express a founding plant: each allele copy is drawn from the species
 * distribution for its locus, using randomness seeded by the plant's name.
 * Bounded variance comes from the distribution's shape, so a species with a
 * narrow distribution produces near-identical founders.
 */
export function founderGenome(
  template: SpeciesTemplate,
  seed: string,
): Genome {
  const alleles: (readonly [Allele, Allele])[] = []
  for (const locus of LOCI) {
    const declared = template.distributions[locus.id]
    const distribution = declared ?? defaultDistribution(locus)
    const count = alleleCount(locus)
    if (distribution.length !== count) {
      throw new Error(
        `Species ${template.id}: distribution for ${locus.id} has ` +
          `${distribution.length} entries, expected ${count}`,
      )
    }
    const r = rngFrom(`${seed}|${template.id}|${locus.id}`)
    const a = pickWeighted(distribution, r())
    const b = pickWeighted(distribution, r())
    alleles.push([a, b] as const)
  }
  return { version: GENOME_VERSION, alleles }
}
```

Move the `import { defaultDistribution, type SpeciesTemplate } from './species.ts'` line to the top of the file with the other imports rather than leaving it mid-file. Final import block:

```ts
import { LOCI, locusAt, locusIndex, type Locus } from './loci.ts'
import { hash32, pickWeighted, rngFrom } from './rng.ts'
import { defaultDistribution, type SpeciesTemplate } from './species.ts'
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/species.ts packages/engine/src/genome.ts packages/engine/test/species.test.ts
git commit -m "feat(engine): species templates as allele distributions, and founder expression"
```

---

### Task 5: Discrete trait resolution through the blend coefficient

This is the inheritance rule the whole breeding system rests on, and the one place the spec was recently corrected.

**Files:**
- Create: `packages/engine/src/phenotype.ts`
- Test: `packages/engine/test/phenotype.test.ts`

**Interfaces:**
- Consumes: `DiscreteLocus`, `Allele` from `./loci.ts` / `./genome.ts`
- Produces: `DiscreteTrait`, `Phenotype`, `resolveDiscrete(locus, pair)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/phenotype.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveDiscrete } from '../src/phenotype.ts'
import type { DiscreteLocus } from '../src/loci.ts'

const thorned: DiscreteLocus = {
  id: 'thorn.presence',
  kind: 'discrete',
  alleles: ['thornless', 'thorned'],
  blend: 0,
  mutation: 0.004,
}

const series: DiscreteLocus = {
  id: 'pigment.anthocyanidin',
  kind: 'discrete',
  alleles: ['none', 'pelargonidin', 'cyanidin', 'delphinidin'],
  blend: 0,
  mutation: 0.004,
}

const codominant: DiscreteLocus = { ...series, blend: 1 }
const incomplete: DiscreteLocus = { ...series, blend: 0.5 }

describe('resolveDiscrete', () => {
  it('expresses the allele alone when homozygous', () => {
    const trait = resolveDiscrete(series, [2, 2])
    expect(trait.expressed).toEqual(['cyanidin'])
    expect(trait.winner).toBe(2)
    expect(trait.blended).toBe(false)
    expect(trait.secondaryWeight).toBe(0)
  })

  it('expresses the higher-ranked allele alone under complete dominance', () => {
    const trait = resolveDiscrete(thorned, [0, 1])
    expect(trait.expressed).toEqual(['thorned'])
    expect(trait.winner).toBe(1)
    expect(trait.blended).toBe(false)
  })

  it('is insensitive to copy order', () => {
    expect(resolveDiscrete(thorned, [0, 1])).toEqual(resolveDiscrete(thorned, [1, 0]))
    expect(resolveDiscrete(series, [1, 3])).toEqual(resolveDiscrete(series, [3, 1]))
  })

  it('follows the dominance series, not the index order of the pair', () => {
    const trait = resolveDiscrete(series, [1, 3])
    expect(trait.winner).toBe(3)
    expect(trait.expressed).toEqual(['delphinidin'])
  })

  it('expresses both alleles under codominance', () => {
    const trait = resolveDiscrete(codominant, [1, 3])
    expect(trait.expressed).toEqual(['delphinidin', 'pelargonidin'])
    expect(trait.blended).toBe(true)
    expect(trait.secondaryWeight).toBeCloseTo(0.5, 10)
  })

  it('masks the lower allele partly under incomplete dominance', () => {
    const trait = resolveDiscrete(incomplete, [1, 3])
    expect(trait.expressed).toEqual(['delphinidin', 'pelargonidin'])
    expect(trait.blended).toBe(true)
    expect(trait.secondaryWeight).toBeCloseTo(0.5, 10)
    expect(trait.secondaryWeight).toBeLessThan(0.5 + 1e-9)
  })

  it('does not blend a homozygous pair even when codominant', () => {
    const trait = resolveDiscrete(codominant, [3, 3])
    expect(trait.expressed).toEqual(['delphinidin'])
    expect(trait.blended).toBe(false)
  })

  it('rejects an allele outside the locus', () => {
    expect(() => resolveDiscrete(thorned, [0, 2])).toThrow(/invalid allele/i)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test phenotype`
Expected: FAIL. `Failed to resolve import "../src/phenotype.ts"`.

- [ ] **Step 3: Implement resolveDiscrete**

`packages/engine/src/phenotype.ts`:

```ts
import type { Allele, Genome } from './genome.ts'
import type { DiscreteLocus } from './loci.ts'

export interface DiscreteTrait {
  /** Allele names being expressed, highest-ranked first. Two entries when blended. */
  readonly expressed: readonly string[]
  /** Index of the highest-ranked expressed allele. */
  readonly winner: number
  /** True when both copies contribute to the phenotype. */
  readonly blended: boolean
  /** Contribution of `expressed[1]` when blended, in [0, 0.5]. Otherwise 0. */
  readonly secondaryWeight: number
}

export interface Phenotype {
  readonly discrete: Readonly<Record<string, DiscreteTrait>>
  readonly quantitative: Readonly<Record<string, number>>
}

/** Internal, mutable working shape. Frozen out by `express`. */
export interface MutablePhenotype {
  discrete: Record<string, DiscreteTrait>
  quantitative: Record<string, number>
}

/**
 * Resolve a diploid pair at a discrete locus.
 *
 * Allele order in the locus is the dominance series: the higher index is more
 * potent. `blend` then says how the two copies combine:
 *   0   complete dominance: only the higher-ranked allele is expressed
 *   1   codominance: both are expressed equally
 *   betwixt: incomplete dominance, the lower one partly masked
 */
export function resolveDiscrete(
  locus: DiscreteLocus,
  pair: readonly [Allele, Allele],
): DiscreteTrait {
  for (const allele of pair) {
    if (!Number.isInteger(allele) || allele < 0 || allele >= locus.alleles.length) {
      throw new Error(`Invalid allele ${allele} at locus ${locus.id}`)
    }
  }

  const low = Math.min(pair[0], pair[1])
  const high = Math.max(pair[0], pair[1])
  const highName = locus.alleles[high]
  const lowName = locus.alleles[low]
  if (highName === undefined || lowName === undefined) {
    throw new Error(`Missing allele name at locus ${locus.id}`)
  }

  if (low === high || locus.blend === 0) {
    return { expressed: [highName], winner: high, blended: false, secondaryWeight: 0 }
  }

  const secondaryWeight = (1 - locus.blend) / 2
  return {
    expressed: [highName, lowName],
    winner: high,
    blended: true,
    secondaryWeight,
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test phenotype && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/phenotype.ts packages/engine/test/phenotype.test.ts
git commit -m "feat(engine): discrete trait resolution via the blend coefficient"
```

---

### Task 6: Phenotype assembly — polygenic quantitative traits

**Files:**
- Modify: `packages/engine/src/phenotype.ts` (add `DERIVED_TRAITS`, `express`)
- Modify: `packages/engine/test/phenotype.test.ts` (add a suite)

**Interfaces:**
- Consumes: `Genome` from `./genome.ts`; `LOCI`, `quantitativeTraits` from `./loci.ts`; `resolveDiscrete` from this file; `applyEpistasis` from `./epistasis.ts` (Task 7)
- Produces: `DERIVED_TRAITS`, `express(genome): Phenotype`

`express` calls `applyEpistasis`, which does not exist until Task 7. Write `express` in this task **without** that call, then add the call in Task 7. That keeps every task green.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/test/phenotype.test.ts`:

```ts
import { createGenome, type Genome } from '../src/genome.ts'
import { LOCI, locusIndex, quantitativeTraits } from '../src/loci.ts'
import { DERIVED_TRAITS, express } from '../src/phenotype.ts'

const flat = (): Genome => createGenome(LOCI.map(() => [0, 0] as const))

function setAllele(genome: Genome, locusId: string, a: number, b: number): Genome {
  const alleles = genome.alleles.map((pair, i) =>
    i === locusIndex(locusId) ? ([a, b] as const) : pair,
  )
  return createGenome(alleles)
}

describe('express', () => {
  it('covers every locus', () => {
    const phenotype = express(flat())
    for (const locus of LOCI) {
      if (locus.kind === 'discrete') {
        expect(phenotype.discrete[locus.id]).toBeDefined()
      }
    }
  })

  it('sums polygenic contributions per trait', () => {
    const phenotype = express(flat())
    expect(phenotype.quantitative['height']).toBe(0)

    const tall = setAllele(flat(), 'habit.height.a', 1, 1)
    expect(express(tall).quantitative['height']).toBeCloseTo(0.18, 10)
  })

  it('accumulates several loci onto one trait', () => {
    let g = setAllele(flat(), 'petal.count.a', 1, 1)
    g = setAllele(g, 'petal.count.b', 1, 1)
    expect(express(g).quantitative['petal.count']).toBeCloseTo(2.3, 10)
  })

  it('includes every quantitative trait, present or not', () => {
    const phenotype = express(flat())
    for (const trait of quantitativeTraits()) {
      expect(typeof phenotype.quantitative[trait]).toBe('number')
    }
  })

  it('includes the derived traits that epistasis rules write to', () => {
    const phenotype = express(flat())
    for (const [trait, value] of Object.entries(DERIVED_TRAITS)) {
      expect(phenotype.quantitative[trait]).toBeCloseTo(value, 10)
    }
  })

  it('is deterministic', () => {
    const g = setAllele(flat(), 'thorn.presence', 1, 0)
    expect(express(g)).toEqual(express(g))
  })

  it('does not mutate the genome', () => {
    const g = flat()
    const before = JSON.stringify(g)
    express(g)
    expect(JSON.stringify(g)).toBe(before)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test phenotype`
Expected: FAIL. `express is not a function`.

- [ ] **Step 3: Implement express**

Append to `packages/engine/src/phenotype.ts`:

```ts
import { LOCI, quantitativeTraits } from './loci.ts'

/**
 * Traits that no locus contributes to directly; they are outputs of the
 * epistasis rules in `epistasis.ts`. Declared here so a phenotype always has
 * a complete, predictable shape.
 */
export const DERIVED_TRAITS: Readonly<Record<string, number>> = {
  'pigment.hue': 0,
  'pigment.saturation': 0,
  'pigment.lightness': 0.92,
  'flower.fertility': 1,
}

/**
 * Genotype to phenotype. Discrete loci resolve through `resolveDiscrete`;
 * quantitative loci sum their weight for every copy carrying allele 1.
 */
export function express(genome: Genome): Phenotype {
  const mutable: MutablePhenotype = { discrete: {}, quantitative: {} }

  for (const trait of quantitativeTraits()) mutable.quantitative[trait] = 0
  for (const [trait, value] of Object.entries(DERIVED_TRAITS)) {
    mutable.quantitative[trait] = value
  }

  LOCI.forEach((locus, index) => {
    const pair = genome.alleles[index]
    if (pair === undefined) {
      throw new Error(`Genome is missing locus ${locus.id}; run migrateGenome first`)
    }
    if (locus.kind === 'discrete') {
      mutable.discrete[locus.id] = resolveDiscrete(locus, pair)
      return
    }
    const current = mutable.quantitative[locus.trait] ?? 0
    mutable.quantitative[locus.trait] = current + locus.weight * (pair[0] + pair[1])
  })

  // Epistasis rules are applied here, added in Task 7.
  return mutable
}
```

`MutablePhenotype` is structurally assignable to `Phenotype`, so returning it as
`Phenotype` is fine and the return type needs no change in Task 7.

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test phenotype && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/phenotype.ts packages/engine/test/phenotype.test.ts
git commit -m "feat(engine): phenotype assembly with polygenic quantitative traits"
```

---

### Task 7: The epistasis rules

Where realism and surprise come from, and where the colour pathway and the double-flower tradeoff live.

**Files:**
- Create: `packages/engine/src/epistasis.ts`
- Create: `packages/engine/test/epistasis.test.ts`
- Modify: `packages/engine/src/phenotype.ts` (call `applyEpistasis` at the end of `express`)

**Interfaces:**
- Consumes: `MutablePhenotype` and `DiscreteTrait` types from `./phenotype.ts`
- Produces: `EpistasisRule`, `EPISTASIS`, `applyEpistasis(phenotype)`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/epistasis.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyEpistasis } from '../src/epistasis.ts'
import type { MutablePhenotype } from '../src/phenotype.ts'

function base(): MutablePhenotype {
  return {
    discrete: {
      'pigment.anthocyanidin': {
        expressed: ['none'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
      'pigment.carotenoid': {
        expressed: ['none'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
      'pigment.petal.chlorophyll': {
        expressed: ['none'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
      'flower.doubling': {
        expressed: ['single'],
        winner: 0,
        blended: false,
        secondaryWeight: 0,
      },
    },
    quantitative: {
      'pigment.hue': 0,
      'pigment.saturation': 0,
      'pigment.lightness': 0.92,
      'pigment.intensity': 0,
      'pigment.copigment': 0,
      'pigment.vacuolar.ph': 0,
      'petal.count': 5,
      'flower.fertility': 1,
    },
  }
}

function withWinner(
  phenotype: MutablePhenotype,
  locusId: string,
  name: string,
  winner: number,
): MutablePhenotype {
  phenotype.discrete[locusId] = {
    expressed: [name],
    winner,
    blended: false,
    secondaryWeight: 0,
  }
  return phenotype
}

describe('the colour pathway', () => {
  it('leaves an anthocyanin-free, carotenoid-free flower near white', () => {
    const p = applyEpistasis(base())
    expect(p.quantitative['pigment.saturation']).toBeLessThan(0.1)
    expect(p.quantitative['pigment.lightness']).toBeGreaterThan(0.85)
  })

  it('gives pelargonidin a warm hue', () => {
    const p = applyEpistasis(withWinner(base(), 'pigment.anthocyanidin', 'pelargonidin', 1))
    expect(p.quantitative['pigment.hue']).toBeGreaterThan(0)
    expect(p.quantitative['pigment.hue']).toBeLessThan(60)
  })

  it('gives delphinidin a violet hue', () => {
    const p = applyEpistasis(withWinner(base(), 'pigment.anthocyanidin', 'delphinidin', 3))
    expect(p.quantitative['pigment.hue']).toBeGreaterThan(250)
    expect(p.quantitative['pigment.hue']).toBeLessThan(310)
  })

  it('reaches blue only with delphinidin, copigment and pH together', () => {
    const delphinidinOnly = applyEpistasis(
      withWinner(base(), 'pigment.anthocyanidin', 'delphinidin', 3),
    )
    const everything = base()
    withWinner(everything, 'pigment.anthocyanidin', 'delphinidin', 3)
    everything.quantitative['pigment.copigment'] = 0.9
    everything.quantitative['pigment.vacuolar.ph'] = 0.9
    const blue = applyEpistasis(everything)

    expect(delphinidinOnly.quantitative['pigment.hue']).toBeGreaterThan(270)
    expect(blue.quantitative['pigment.hue']).toBeLessThan(260)
    expect(blue.quantitative['pigment.hue']).toBeGreaterThan(210)
    expect(blue.quantitative['pigment.hue']).toBeLessThan(
      delphinidinOnly.quantitative['pigment.hue'] ?? 0,
    )
  })

  it('never reaches blue from cyanidin, however much copigment is present', () => {
    const p = base()
    withWinner(p, 'pigment.anthocyanidin', 'cyanidin', 2)
    p.quantitative['pigment.copigment'] = 1
    p.quantitative['pigment.vacuolar.ph'] = 1
    expect(applyEpistasis(p).quantitative['pigment.hue']).toBeGreaterThan(280)
  })

  it('lays anthocyanin over carotenoid for a bronzed flower', () => {
    const p = base()
    withWinner(p, 'pigment.anthocyanidin', 'pelargonidin', 1)
    withWinner(p, 'pigment.carotenoid', 'yellow', 1)
    const bronzed = applyEpistasis(p)
    expect(bronzed.quantitative['pigment.saturation']).toBeGreaterThan(0.4)
  })

  it('gives a pure yellow flower with carotenoid alone', () => {
    const p = withWinner(base(), 'pigment.carotenoid', 'yellow', 1)
    const yellow = applyEpistasis(p)
    expect(yellow.quantitative['pigment.hue']).toBeGreaterThan(35)
    expect(yellow.quantitative['pigment.hue']).toBeLessThan(70)
    expect(yellow.quantitative['pigment.saturation']).toBeGreaterThan(0.3)
  })

  it('gives a green flower with petal chlorophyll and carotenoid', () => {
    const p = withWinner(base(), 'pigment.petal.chlorophyll', 'green', 1)
    withWinner(p, 'pigment.carotenoid', 'yellow', 1)
    const green = applyEpistasis(p)
    expect(green.quantitative['pigment.hue']).toBeGreaterThan(70)
    expect(green.quantitative['pigment.hue']).toBeLessThan(150)
  })
})

describe('the doubling tradeoff', () => {
  it('multiplies petal count and reduces fertility', () => {
    const p = withWinner(base(), 'flower.doubling', 'double', 1)
    const doubled = applyEpistasis(p)
    expect(doubled.quantitative['petal.count']).toBeCloseTo(10, 10)
    expect(doubled.quantitative['flower.fertility']).toBeLessThan(1)
    expect(doubled.quantitative['flower.fertility']).toBeGreaterThan(0)
  })

  it("leaves a single flower's fertility alone", () => {
    const p = applyEpistasis(base())
    expect(p.quantitative['petal.count']).toBeCloseTo(5, 10)
    expect(p.quantitative['flower.fertility']).toBe(1)
  })
})

describe('applyEpistasis', () => {
  it('runs every rule with a declared id', () => {
    for (const rule of EPISTASIS) expect(rule.id.length).toBeGreaterThan(0)
  })

  it('mutates its working copy and returns it', () => {
    const p = base()
    expect(applyEpistasis(p)).toBe(p)
  })
})
```

Add `EPISTASIS` to the import list at the top of the test file.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test epistasis`
Expected: FAIL. `Failed to resolve import "../src/epistasis.ts"`.

- [ ] **Step 3: Implement the rules**

`packages/engine/src/epistasis.ts`:

```ts
import type { MutablePhenotype } from './phenotype.ts'

export interface EpistasisRule {
  readonly id: string
  readonly when: (phenotype: MutablePhenotype) => boolean
  readonly apply: (phenotype: MutablePhenotype) => void
}

const winner = (p: MutablePhenotype, locusId: string): string =>
  p.discrete[locusId]?.expressed[0] ?? ''

const trait = (p: MutablePhenotype, key: string): number => p.quantitative[key] ?? 0

/** Rotate `from` toward `to` by `amount` in [0, 1], the short way round the wheel. */
function rotateHue(from: number, to: number, amount: number): number {
  let delta = ((to - from + 540) % 360) - 180
  const moved = from + delta * amount
  return (moved + 360) % 360
}

/** Base hues for each anthocyanidin branch, in degrees. */
const ANTHOCYANIDIN_HUE: Readonly<Record<string, number>> = {
  'none': 0,
  pelargonidin: 18,
  cyanidin: 332,
  delphinidin: 288,
}

/** Base hue for each carotenoid allele. */
const CAROTENOID_HUE: Readonly<Record<string, number>> = {
  'none': 0,
  yellow: 52,
  orange: 32,
  red: 8,
}

/**
 * The rule table. Order matters: later rules read what earlier ones wrote.
 * Every rule is a pure function of the phenotype it is handed.
 */
export const EPISTASIS: readonly EpistasisRule[] = [
  {
    id: 'colour.anthocyanidin.base',
    when: (p) => winner(p, 'pigment.anthocyanidin') !== 'none',
    apply: (p) => {
      const branch = winner(p, 'pigment.anthocyanidin')
      p.quantitative['pigment.hue'] = ANTHOCYANIDIN_HUE[branch] ?? 0
      const intensity = trait(p, 'pigment.intensity')
      p.quantitative['pigment.saturation'] = 0.25 + 0.65 * Math.min(1, intensity)
      p.quantitative['pigment.lightness'] = 0.72 - 0.25 * Math.min(1, intensity)
    },
  },
  {
    id: 'colour.carotenoid.base',
    when: (p) =>
      winner(p, 'pigment.carotenoid') !== 'none' &&
      winner(p, 'pigment.anthocyanidin') === 'none' &&
      winner(p, 'pigment.petal.chlorophyll') === 'none',
    apply: (p) => {
      const branch = winner(p, 'pigment.carotenoid')
      p.quantitative['pigment.hue'] = CAROTENOID_HUE[branch] ?? 50
      p.quantitative['pigment.saturation'] = 0.7
      p.quantitative['pigment.lightness'] = 0.62
    },
  },
  {
    id: 'colour.carotenoid.overlay',
    when: (p) =>
      winner(p, 'pigment.carotenoid') !== 'none' &&
      winner(p, 'pigment.anthocyanidin') !== 'none' &&
      winner(p, 'pigment.petal.chlorophyll') === 'none',
    apply: (p) => {
      // Anthocyanin laid over yellow reads as bronze, brick or russet.
      const branch = winner(p, 'pigment.carotenoid')
      p.quantitative['pigment.hue'] = rotateHue(
        trait(p, 'pigment.hue'),
        CAROTENOID_HUE[branch] ?? 50,
        0.3,
      )
      p.quantitative['pigment.saturation'] = Math.min(
        1,
        trait(p, 'pigment.saturation') + 0.2,
      )
    },
  },
  {
    id: 'colour.petal.chlorophyll',
    when: (p) => winner(p, 'pigment.petal.chlorophyll') === 'green',
    apply: (p) => {
      p.quantitative['pigment.hue'] = 104
      p.quantitative['pigment.saturation'] = 0.32
      p.quantitative['pigment.lightness'] = 0.68
    },
  },
  {
    id: 'colour.copigment.shift',
    when: (p) =>
      trait(p, 'pigment.copigment') > 0.45 &&
      winner(p, 'pigment.anthocyanidin') !== 'none' &&
      winner(p, 'pigment.petal.chlorophyll') !== 'green',
    apply: (p) => {
      const strength = Math.min(1, (trait(p, 'pigment.copigment') - 0.45) / 0.55)
      p.quantitative['pigment.hue'] = rotateHue(
        trait(p, 'pigment.hue'),
        250,
        strength * 0.45,
      )
      p.quantitative['pigment.saturation'] = Math.min(
        1,
        trait(p, 'pigment.saturation') + 0.1,
      )
    },
  },
  {
    id: 'colour.vacuolar.ph.shift',
    when: (p) =>
      trait(p, 'pigment.vacuolar.ph') > 0.5 &&
      winner(p, 'pigment.anthocyanidin') === 'delphinidin' &&
      winner(p, 'pigment.petal.chlorophyll') !== 'green',
    apply: (p) => {
      // Only the delphinidin branch can be pushed to true blue. This is the
      // real constraint: there was no blue rose until the pathway was
      // engineered.
      const strength = Math.min(1, (trait(p, 'pigment.vacuolar.ph') - 0.5) / 0.5)
      p.quantitative['pigment.hue'] = rotateHue(
        trait(p, 'pigment.hue'),
        232,
        strength * 0.7,
      )
    },
  },
  {
    id: 'flower.doubling.expands',
    when: (p) => winner(p, 'flower.doubling') === 'double',
    apply: (p) => {
      // Homeotic conversion of stamens into petals: more petals, less seed.
      p.quantitative['petal.count'] = trait(p, 'petal.count') * 1.9
      p.quantitative['flower.fertility'] = 0.4
    },
  },
]

/** Apply every rule whose condition holds, in order. Mutates and returns. */
export function applyEpistasis(phenotype: MutablePhenotype): MutablePhenotype {
  for (const rule of EPISTASIS) {
    if (rule.when(phenotype)) rule.apply(phenotype)
  }
  return phenotype
}
```

Note: `let delta` in `rotateHue` is never reassigned, so declare it `const`.

- [ ] **Step 4: Wire epistasis into express**

Two edits to `packages/engine/src/phenotype.ts`:

1. Add to the imports:

```ts
import { applyEpistasis } from './epistasis.ts'
```

2. Replace the placeholder comment with the call:

```ts
  applyEpistasis(mutable)
  return mutable
}
```

The return type does not change: `MutablePhenotype` is assignable to `Phenotype`.

`epistasis.ts` imports only types from `phenotype.ts`, so the cycle is erased at
runtime by `verbatimModuleSyntax` and neither module breaks.

- [ ] **Step 5: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/epistasis.ts packages/engine/src/phenotype.ts packages/engine/test/epistasis.test.ts
git commit -m "feat(engine): epistasis rules for the colour pathway and the doubling tradeoff"
```

---

### Task 8: Reproduction — meiosis, independent assortment, mutation

**Files:**
- Create: `packages/engine/src/reproduce.ts`
- Create: `packages/engine/test/reproduce.test.ts`

**Interfaces:**
- Consumes: `Genome`, `createGenome`, `genomeId`, `GENOME_VERSION`, `Allele` from `./genome.ts`; `LOCI`, `locusAt` from `./loci.ts`; `hash32`, `rngFrom` from `./rng.ts`
- Produces: `meiosis(parent, childName, side): readonly Allele[]`, `mutateAllele(locus, allele, r): Allele`, `reproduce(childName, parentA, parentB): Genome`

- [ ] **Step 1: Write the failing test**

`packages/engine/test/reproduce.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createGenome, genomeId, type Genome } from '../src/genome.ts'
import { LOCI, locusAt, locusIndex } from '../src/loci.ts'
import { meiosis, mutateAllele, reproduce } from '../src/reproduce.ts'

function patterned(offset: number): Genome {
  return createGenome(
    LOCI.map((locus, i) => {
      const count = locus.kind === 'discrete' ? locus.alleles.length : 2
      return [(i + offset) % count, (i + offset + 1) % count] as const
    }),
  )
}

describe('meiosis', () => {
  it('returns exactly one allele per locus', () => {
    const haplotype = meiosis(patterned(0), 'Amara', 0)
    expect(haplotype.length).toBe(LOCI.length)
  })

  it('picks an allele the parent actually carries', () => {
    const parent = patterned(0)
    const haplotype = meiosis(parent, 'Amara', 0)
    haplotype.forEach((allele, i) => {
      const pair = parent.alleles[i]
      if (pair === undefined) throw new Error('missing pair')
      expect([pair[0], pair[1]]).toContain(allele)
    })
  })

  it('is deterministic for the same child name and side', () => {
    const parent = patterned(0)
    expect(meiosis(parent, 'Amara', 0)).toEqual(meiosis(parent, 'Amara', 0))
  })

  it('differs between child names', () => {
    const parent = patterned(0)
    expect(meiosis(parent, 'Amara', 0)).not.toEqual(meiosis(parent, 'Kofi', 0))
  })

  it('differs between sides, so selfing still recombines', () => {
    const parent = patterned(0)
    expect(meiosis(parent, 'Amara', 0)).not.toEqual(meiosis(parent, 'Amara', 1))
  })

  it('segregates both copies across many draws', () => {
    const parent = patterned(0)
    const seen = new Set<number>()
    for (let i = 0; i < 60; i += 1) {
      seen.add(meiosis(parent, `child-${i}`, 0)[0] ?? -1)
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('mutateAllele', () => {
  it('leaves the allele alone when r is above the mutation rate', () => {
    const locus = locusAt(locusIndex('thorn.presence'))
    expect(mutateAllele(locus, 1, 0.99)).toBe(1)
  })

  it('changes the allele when r is below the mutation rate', () => {
    const locus = locusAt(locusIndex('thorn.presence'))
    expect(mutateAllele(locus, 1, 0.0)).not.toBe(1)
  })

  it('always returns a valid allele', () => {
    for (let i = 0; i < LOCI.length; i += 1) {
      const locus = locusAt(i)
      const count = locus.kind === 'discrete' ? locus.alleles.length : 2
      for (const r of [0, 0.001, 0.5, 0.999]) {
        const result = mutateAllele(locus, 0, r)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThan(count)
      }
    }
  })

  it('is deterministic', () => {
    const locus = locusAt(locusIndex('pigment.anthocyanidin'))
    expect(mutateAllele(locus, 0, 0.0001)).toBe(mutateAllele(locus, 0, 0.0001))
  })
})

describe('reproduce', () => {
  it('is deterministic in the child name and both parents', () => {
    const a = patterned(0)
    const b = patterned(2)
    expect(reproduce('Amara', a, b)).toEqual(reproduce('Amara', a, b))
    expect(genomeId(reproduce('Amara', a, b))).toBe(genomeId(reproduce('Amara', a, b)))
  })

  it('produces a different child for a different name', () => {
    const a = patterned(0)
    const b = patterned(2)
    expect(reproduce('Amara', a, b)).not.toEqual(reproduce('Kofi', a, b))
  })

  it('produces one valid pair per locus', () => {
    const child = reproduce('Amara', patterned(0), patterned(2))
    expect(child.alleles.length).toBe(LOCI.length)
    expect(child.version).toBe(1)
    child.alleles.forEach((pair, i) => {
      const locus = locusAt(i)
      const count = locus.kind === 'discrete' ? locus.alleles.length : 2
      for (const allele of pair) {
        expect(allele).toBeGreaterThanOrEqual(0)
        expect(allele).toBeLessThan(count)
      }
    })
  })

  it('recombines, rather than copying either parent', () => {
    const a = patterned(0)
    const b = patterned(2)
    const child = reproduce('Amara', a, b)
    expect(genomeId(child)).not.toBe(genomeId(a))
    expect(genomeId(child)).not.toBe(genomeId(b))
  })

  it('recombines even when both parents are the same genome', () => {
    const a = patterned(0)
    const selfed = reproduce('Amara', a, a)
    expect(selfed.alleles.length).toBe(LOCI.length)
    expect(genomeId(selfed)).not.toBe(genomeId(a))
  })

  it('mutates at roughly the configured rate', () => {
    const a = patterned(0)
    const b = patterned(2)
    const rate = 0.004
    let differences = 0
    let total = 0
    const n = 300
    for (let i = 0; i < n; i += 1) {
      const child = reproduce(`child-${i}`, a, b)
      const unaMutated = reproduce(`child-${i}`, a, b)
      child.alleles.forEach((pair, locusIdx) => {
        total += 2
        const baseline = unaMutated.alleles[locusIdx]
        if (baseline === undefined) return
        if (pair[0] !== baseline[0]) differences += 1
        if (pair[1] !== baseline[1]) differences += 1
      })
    }
    // This only bounds the rate loosely; Task 11's CLI reports it precisely.
    expect(differences).toBeGreaterThanOrEqual(0)
    expect(differences / total).toBeLessThan(rate * 8)
  })
})
```

Note: the last test cannot isolate mutations from meiosis because both are deterministic in the same name, so drop it in favour of a direct rate test on `mutateAllele` over many synthetic draws:

```ts
  it('mutates at roughly the configured rate', () => {
    const locus = locusAt(locusIndex('thorn.presence'))
    let mutations = 0
    const n = 100_000
    for (let i = 0; i < n; i += 1) {
      if (mutateAllele(locus, 0, (i + 0.5) / n) !== 0) mutations += 1
    }
    expect(mutations / n).toBeGreaterThan(locus.mutation * 0.8)
    expect(mutations / n).toBeLessThan(locus.mutation * 1.2)
  })
```

That is the test to write.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test reproduce`
Expected: FAIL. `Failed to resolve import "../src/reproduce.ts"`.

- [ ] **Step 3: Implement reproduce.ts**

`packages/engine/src/reproduce.ts`:

```ts
import {
  GENOME_VERSION,
  createGenome,
  genomeId,
  type Allele,
  type Genome,
} from './genome.ts'
import { LOCI, locusAt, type Locus } from './loci.ts'
import { hash32, rngFrom } from './rng.ts'

/**
 * One haploid contribution from a parent.
 *
 * Loci assort independently: they do not co-segregate as though they shared a
 * chromosome (linkage is deferred, spec §18). `side` salts the randomness so
 * that selfing still recombines rather than cloning.
 */
export function meiosis(
  parent: Genome,
  childName: string,
  side: 0 | 1,
): readonly Allele[] {
  const parentId = genomeId(parent)
  const haplotype: Allele[] = []
  for (const locus of LOCI) {
    const index = LOCI.indexOf(locus)
    const pair = parent.alleles[index]
    if (pair === undefined) throw new Error(`Parent is missing locus ${locus.id}`)
    const r = rngFrom(`${childName}|${parentId}|${side}|${locus.id}`)
    haplotype.push(r() < 0.5 ? pair[0] : pair[1])
  }
  return haplotype
}

/**
 * Mutate one allele copy. `r` in [0, 1) is compared against the locus rate, so
 * this is deterministic given `r`.
 */
export function mutateAllele(locus: Locus, allele: Allele, r: number): Allele {
  if (r >= locus.mutation) return allele
  const count = locus.kind === 'discrete' ? locus.alleles.length : 2
  if (count <= 1) return 0
  // Deterministic step away from the current allele, wrapping.
  const direction = hash32(`${locus.id}|${allele}`) % 2 === 0 ? 1 : count - 1
  return (allele + direction) % count
}

/**
 * Two parents and a name produce a child genome. Pure: the same three inputs
 * always produce the same plant, forever, on every device.
 */
export function reproduce(
  childName: string,
  parentA: Genome,
  parentB: Genome,
): Genome {
  const fromA = meiosis(parentA, childName, 0)
  const fromB = meiosis(parentB, childName, 1)

  const alleles: (readonly [Allele, Allele])[] = []
  LOCI.forEach((locus, index) => {
    const a0 = fromA[index]
    const b0 = fromB[index]
    if (a0 === undefined || b0 === undefined) {
      throw new Error(`Meiosis produced no allele for locus ${locus.id}`)
    }
    const locusRef = locusAt(index)
    const ra = rngFrom(`${childName}|mutate|0|${locus.id}`)
    const rb = rngFrom(`${childName}|mutate|1|${locus.id}`)
    alleles.push([
      mutateAllele(locusRef, a0, ra()),
      mutateAllele(locusRef, b0, rb()),
    ] as const)
  })

  return createGenome(alleles)
}

export const REPRODUCE_VERSION = GENOME_VERSION
```

Two cleanups while implementing: replace the `LOCI.indexOf(locus)` iteration in `meiosis` with an indexed loop, because `indexOf` inside a loop is both slow and fragile:

```ts
  for (let index = 0; index < LOCI.length; index += 1) {
    const locus = locusAt(index)
    ...
  }
```

and delete the unused `REPRODUCE_VERSION` export.

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test reproduce && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/reproduce.ts packages/engine/test/reproduce.test.ts
git commit -m "feat(engine): meiosis with independent assortment, deterministic mutation, and reproduction"
```

---

### Task 9: The four founding species

**Files:**
- Modify: `packages/engine/src/species.ts` (add `ROSEMARY`, `DANDELION`, `SPEARMINT`, `JACARANDA`, `SPECIES`)
- Modify: `packages/engine/test/species.test.ts` (add a suite)

**Interfaces:**
- Consumes: `SpeciesTemplate` from this file; `founderGenome`, `genomeId` from `./genome.ts`; `express` from `./phenotype.ts`
- Produces: `ROSEMARY`, `DANDELION`, `SPEARMINT`, `JACARANDA`, `SPECIES`

Values are a first pass. They are tuned at M0c against the art gate, and the point of this task is that tuning is editing numbers, not code.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/test/species.test.ts`:

```ts
import { express } from '../src/phenotype.ts'
import { DANDELION, JACARANDA, ROSEMARY, SPECIES, SPEARMINT } from '../src/species.ts'

function phenotypeFor(template: SpeciesTemplate, name: string) {
  return express(founderGenome(template, name))
}

describe('the founding species', () => {
  it('exports four species with unique ids and lineages', () => {
    expect(SPECIES.length).toBe(4)
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(4)
    for (const s of SPECIES) {
      expect(s.lineage.length).toBeGreaterThan(0)
      expect(s.binomial.length).toBeGreaterThan(0)
      expect(s.daysToBloom).toBeGreaterThan(0)
      expect(s.thermalConstant).toBeGreaterThan(0)
    }
  })

  it('declares distributions that match their loci', () => {
    for (const template of SPECIES) {
      for (const [locusId, distribution] of Object.entries(template.distributions)) {
        const locus = LOCI[locusIndex(locusId)]
        if (locus === undefined) throw new Error(`unknown locus ${locusId}`)
        const count = locus.kind === 'discrete' ? locus.alleles.length : 2
        expect(distribution.length).toBe(count)
        const total = distribution.reduce((sum, p) => sum + p, 0)
        expect(total).toBeCloseTo(1, 6)
      }
    }
  })

  it('makes rosemary a thorny, narrow-leaved, blue-flowered perennial', () => {
    const template = ROSEMARY
    expect(template.lifecycle).toBe('perennial')
    let thorned = 0
    let needleLike = 0
    let delphinidinOrCyanidin = 0
    const n = 200
    for (let i = 0; i < n; i += 1) {
      const phenotype = phenotypeFor(template, `rosemary-${i}`)
      if (phenotype.discrete['thorn.presence']?.winner === 1) thorned += 1
      if (phenotype.discrete['leaf.form']?.winner === 0) needleLike += 1
      const branch = phenotype.discrete['pigment.anthocyanidin']?.winner ?? 0
      if (branch === 2 || branch === 3) delphinidinOrCyanidin += 1
    }
    expect(thorned / n).toBeGreaterThan(0.8)
    expect(needleLike / n).toBeGreaterThan(0.8)
    expect(delphinidinOrCyanidin / n).toBeGreaterThan(0.6)
  })

  it('makes dandelion a perennial with a solitary head', () => {
    let heads = 0
    const n = 200
    for (let i = 0; i < n; i += 1) {
      const phenotype = phenotypeFor(DANDELION, `dandelion-${i}`)
      if (phenotype.discrete['inflorescence.type']?.winner === 6) heads += 1
    }
    expect(DANDELION.lifecycle).toBe('perennial')
    expect(heads / n).toBeGreaterThan(0.9)
  })

  it('makes spearmint an opposite-leaved herb with whorled flowers', () => {
    let opposite = 0
    const n = 200
    for (let i = 0; i < n; i += 1) {
      const phenotype = phenotypeFor(SPEARMINT, `mint-${i}`)
      if (phenotype.discrete['phyllotaxis.pattern']?.winner === 1) opposite += 1
    }
    expect(opposite / n).toBeGreaterThan(0.85)
    expect(SPEARMINT.lifecycle).toBe('perennial')
  })

  it('makes jacaranda a thornless bipinnate tree with panicles', () => {
    let thornless = 0
    let bipinnate = 0
    let panicle = 0
    const n = 200
    for (let i = 0; i < n; i += 1) {
      const phenotype = phenotypeFor(JACARANDA, `jacaranda-${i}`)
      if (phenotype.discrete['thorn.presence']?.winner === 0) thornless += 1
      if (phenotype.discrete['leaf.form']?.winner === 2) bipinnate += 1
      if (phenotype.discrete['inflorescence.type']?.winner === 3) panicle += 1
    }
    expect(thornless / n).toBeGreaterThan(0.9)
    expect(bipinnate / n).toBeGreaterThan(0.9)
    expect(panicle / n).toBeGreaterThan(0.85)
  })

  it('gives each species a distinct thermal budget', () => {
    const constants = SPECIES.map((s) => s.thermalConstant)
    expect(new Set(constants).size).toBeGreaterThan(2)
    // A tree takes longer from germination to first bloom than a herb.
    expect(JACARANDA.thermalConstant).toBeGreaterThan(DANDELION.thermalConstant)
  })

  it('keeps expressed traits inside plausible bounds for every species', () => {
    for (const template of SPECIES) {
      for (let i = 0; i < 50; i += 1) {
        const phenotype = phenotypeFor(template, `${template.id}-${i}`)
        for (const [trait, value] of Object.entries(phenotype.quantitative)) {
          if (!Number.isFinite(value)) {
            throw new Error(`${template.id}: ${trait} is not finite`)
          }
          expect(value).toBeGreaterThanOrEqual(0)
        }
        const lightness = phenotype.quantitative['pigment.lightness'] ?? 0
        expect(lightness).toBeGreaterThanOrEqual(0)
        expect(lightness).toBeLessThanOrEqual(1)
        const saturation = phenotype.quantitative['pigment.saturation'] ?? 0
        expect(saturation).toBeGreaterThanOrEqual(0)
        expect(saturation).toBeLessThanOrEqual(1)
      }
    }
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test species`
Expected: FAIL. `ROSEMARY is not exported`.

- [ ] **Step 3: Add the four species**

Append to `packages/engine/src/species.ts`:

```ts
export const ROSEMARY: SpeciesTemplate = {
  id: 'rosemary',
  commonName: 'Rosemary',
  binomial: 'Salvia rosmarinus',
  lineage: 'Salvia',
  lifecycle: 'perennial',
  daysToBloom: 240,
  thermalBase: 6,
  thermalConstant: 1400,
  distributions: {
    'leaf.form': [0.95, 0.05, 0, 0, 0],
    'leaf.margin': [1, 0, 0, 0],
    'leaf.venation': [1, 0, 0],
    'phyllotaxis.pattern': [0.9, 0.1, 0, 0],
    'stem.pigment': [0.25, 0.75],
    'thorn.presence': [0.05, 0.95],
    'inflorescence.type': [0.08, 0.62, 0.25, 0.05, 0, 0, 0, 0],
    'flower.symmetry': [0, 1],
    'petal.shape': [0, 0, 0.3, 0.7, 0],
    'pigment.anthocyanidin': [0.05, 0.1, 0.25, 0.6],
    'pigment.carotenoid': [1, 0, 0, 0],
    'photoperiod.response': [0.3, 0.4, 0.3],
    'habit.height.a': [0.7, 0.3],
    'leaf.length.a': [0.85, 0.15],
    'leaf.width.a': [0.95, 0.05],
    'lifecycle': [0, 0, 1],
  },
}

export const DANDELION: SpeciesTemplate = {
  id: 'dandelion',
  commonName: 'Dandelion',
  binomial: 'Taraxacum officinale',
  lineage: 'Taraxacum',
  lifecycle: 'perennial',
  daysToBloom: 45,
  thermalBase: 4,
  thermalConstant: 420,
  distributions: {
    'leaf.form': [0.9, 0.1, 0, 0, 0],
    'leaf.margin': [0, 0, 1, 0],
    'leaf.venation': [1, 0, 0],
    'phyllotaxis.pattern': [0.1, 0.05, 0.05, 0.8],
    'thorn.presence': [1, 0],
    'inflorescence.type': [0.04, 0, 0, 0, 0, 0, 0.96, 0],
    'flower.symmetry': [1, 0],
    'petal.shape': [0, 0, 0.2, 0.8, 0],
    'petal.margin': [0, 0, 0.3, 0.7],
    'pigment.anthocyanidin': [1, 0, 0, 0],
    'pigment.carotenoid': [0.05, 0.85, 0.1, 0],
    'photoperiod.response': [0.7, 0.2, 0.1],
    'habit.height.a': [0.8, 0.2],
    'thermal.constant.a': [0.85, 0.15],
    'lifecycle': [0, 0, 1],
  },
}

export const SPEARMINT: SpeciesTemplate = {
  id: 'spearmint',
  commonName: 'Spearmint',
  binomial: 'Mentha spicata',
  lineage: 'Mentha',
  lifecycle: 'perennial',
  daysToBloom: 90,
  thermalBase: 5,
  thermalConstant: 700,
  distributions: {
    'leaf.form': [1, 0, 0, 0, 0],
    'leaf.margin': [0, 1, 0, 0],
    'leaf.venation': [1, 0, 0],
    'phyllotaxis.pattern': [0, 0.95, 0.05, 0],
    'stem.pigment': [1, 0],
    'thorn.presence': [1, 0],
    'inflorescence.type': [0.05, 0.35, 0.55, 0.05, 0, 0, 0, 0],
    'flower.symmetry': [0, 1],
    'petal.shape': [0, 0, 0.4, 0.6, 0],
    'pigment.anthocyanidin': [0.1, 0.6, 0.25, 0.05],
    'pigment.carotenoid': [1, 0, 0, 0],
    'photoperiod.response': [0.2, 0.3, 0.5],
    'habit.height.a': [0.55, 0.45],
    'branch.apical_dominance.a': [0.8, 0.2],
    'lifecycle': [0, 0, 1],
  },
}

export const JACARANDA: SpeciesTemplate = {
  id: 'jacaranda',
  commonName: 'Jacaranda',
  binomial: 'Jacaranda mimosifolia',
  lineage: 'Jacaranda',
  lifecycle: 'perennial',
  daysToBloom: 2900,
  thermalBase: 10,
  thermalConstant: 18_000,
  distributions: {
    'leaf.form': [0, 0.05, 0.95, 0, 0],
    'leaf.margin': [1, 0, 0, 0],
    'leaf.venation': [1, 0, 0],
    'phyllotaxis.pattern': [0, 0.1, 0, 0.9],
    'thorn.presence': [0.96, 0.04],
    'inflorescence.type': [0.05, 0, 0.05, 0.9, 0, 0, 0, 0],
    'flower.symmetry': [0, 1],
    'flower.throat': [0.1, 0.85, 0.05],
    'petal.shape': [0, 0, 0, 0.2, 0.8],
    'pigment.anthocyanidin': [0.02, 0.03, 0.05, 0.9],
    'pigment.carotenoid': [1, 0, 0, 0],
    'pigment.copigment.a': [0.15, 0.85],
    'photoperiod.response': [0.5, 0.4, 0.1],
    'vernalization.required': [0.6, 0.4],
    'habit.height.a': [0.05, 0.95],
    'branch.count.a': [0.1, 0.9],
    'lifecycle': [0, 0, 1],
  },
}

export const SPECIES: readonly SpeciesTemplate[] = [
  ROSEMARY,
  DANDELION,
  SPEARMINT,
  JACARANDA,
]
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm --filter @ink-garden/engine test && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS. If a species assertion fails, adjust that species' distribution rather than the test, unless the test is wrong about the botany.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/species.ts packages/engine/test/species.test.ts
git commit -m "feat(engine): four founding species as allele distributions"
```

---

### Task 10: Public API barrel

**Files:**
- Create: `packages/engine/src/index.ts`
- Test: `packages/engine/test/index.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces: the engine's public surface

- [ ] **Step 1: Write the barrel**

`packages/engine/src/index.ts`:

```ts
/**
 * @ink-garden/engine — public API.
 *
 * Pure, dependency-free, isomorphic. Runs identically in browsers, in Node and
 * in Bun. See the spec, §4 for the genome and §5 for development.
 */

export {
  LOCI,
  LOCUS_INDEX,
  locusAt,
  locusById,
  locusIndex,
  quantitativeTraits,
  type DiscreteLocus,
  type Locus,
  type LocusKind,
  type QuantitativeLocus,
} from './loci.ts'

export { hash32, pickWeighted, rngFrom } from './rng.ts'

export {
  GENOME_VERSION,
  allelePair,
  createGenome,
  deserialiseGenome,
  founderGenome,
  genomeId,
  migrateGenome,
  serialiseGenome,
  type Allele,
  type Genome,
} from './genome.ts'

export {
  DANDELION,
  JACARANDA,
  ROSEMARY,
  SPECIES,
  SPEARMINT,
  defaultDistribution,
  type Lifecycle,
  type SpeciesTemplate,
} from './species.ts'

export {
  DERIVED_TRAITS,
  express,
  resolveDiscrete,
  type DiscreteTrait,
  type Phenotype,
} from './phenotype.ts'

export { EPISTASIS, applyEpistasis, type EpistasisRule } from './epistasis.ts'

export { meiosis, mutateAllele, reproduce } from './reproduce.ts'
```

- [ ] **Step 2: Verify the barrel typechecks and add a smoke test**

Add to `packages/engine/test/cli.test.ts` (created properly in Task 11) is wrong — instead create the file now with only this:

`packages/engine/test/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import * as engine from '../src/index.ts'

describe('public API', () => {
  it('exposes the core entry points', () => {
    for (const name of [
      'LOCI',
      'hash32',
      'rngFrom',
      'pickWeighted',
      'founderGenome',
      'express',
      'reproduce',
      'meiosis',
      'serialiseGenome',
      'migrateGenome',
      'SPECIES',
    ]) {
      expect(engine).toHaveProperty(name)
    }
  })

  it('grows a plant end to end', () => {
    const template = engine.ROSEMARY
    const parent = engine.founderGenome(template, 'Lupin')
    const other = engine.founderGenome(template, 'Amara')
    const child = engine.reproduce('Lupin', parent, other)
    const phenotype = engine.express(child)

    expect(child.alleles.length).toBe(engine.LOCI.length)
    expect(phenotype.quantitative['petal.count']).toBeGreaterThan(0)
    expect(phenotype.discrete['leaf.form']?.expressed.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm --filter @ink-garden/engine test index && pnpm --filter @ink-garden/engine typecheck`
Expected: PASS, 2 tests.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/index.ts packages/engine/test/index.test.ts
git commit -m "feat(engine): public API barrel with an end-to-end smoke test"
```

---

### Task 11: The CLIs and the README

The deliverable of M0a: a command that prints genomes and phenotypes, and a command that reports what happens over generations of breeding. The second one is how we check that breeding stays plausible, which is the art gate's precondition.

**Files:**
- Create: `packages/engine/src/cli/dump.ts`
- Create: `packages/engine/src/cli/descendants.ts`
- Create: `packages/engine/test/cli.test.ts`
- Create: `packages/engine/README.md`

**Interfaces:**
- Consumes: the public API from `./index.ts`
- Produces: two runnable scripts. `dump --species <id> --seed <name>` prints JSON. `descendants --species <id> --count <n> --generations <g>` prints trait statistics.

- [ ] **Step 1: Write the failing test**

`packages/engine/test/cli.test.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

const run = (script: string, args: string[]): string =>
  execFileSync('node', [`src/cli/${script}.ts`, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
  })

describe('dump CLI', () => {
  it('prints a genome and phenotype for a seed', () => {
    const out = run('dump', ['--species', 'rosemary', '--seed', 'Lupin'])
    const parsed = JSON.parse(out) as {
      species: string
      seed: string
      genomeId: string
      genome: { a: number[][] }
      phenotype: { discrete: Record<string, unknown>; quantitative: Record<string, number> }
    }
    expect(parsed.species).toBe('rosemary')
    expect(parsed.seed).toBe('Lupin')
    expect(parsed.genome.a.length).toBeGreaterThan(0)
    expect(Object.keys(parsed.phenotype.discrete).length).toBeGreaterThan(0)
    expect(parsed.phenotype.quantitative['pigment.hue']).toBeDefined()
  })

  it('is deterministic across runs', () => {
    const a = run('dump', ['--species', 'jacaranda', '--seed', 'Amara'])
    const b = run('dump', ['--species', 'jacaranda', '--seed', 'Amara'])
    expect(a).toBe(b)
  })

  it('rejects an unknown species', () => {
    expect(() => run('dump', ['--species', 'nope', '--seed', 'x'])).toThrow()
  })
})

describe('descendants CLI', () => {
  it('reports per-trait statistics over generations', () => {
    const out = run('descendants', [
      '--species', 'dandelion',
      '--count', '40',
      '--generations', '5',
      '--json',
    ])
    const parsed = JSON.parse(out) as {
      generations: number
      sampleSize: number
      traits: Record<string, { min: number; max: number; mean: number; variance: number }>
    }
    expect(parsed.generations).toBe(5)
    expect(parsed.sampleSize).toBe(40)
    const height = parsed.traits['height']
    if (height === undefined) throw new Error('expected a height statistic')
    expect(height.max).toBeGreaterThanOrEqual(height.min)
    expect(height.variance).toBeGreaterThanOrEqual(0)
  })

  it('stays finite and within allele bounds over many generations', () => {
    const out = run('descendants', [
      '--species', 'spearmint',
      '--count', '30',
      '--generations', '12',
      '--json',
    ])
    const parsed = JSON.parse(out) as {
      traits: Record<string, { min: number; max: number }>
    }
    for (const stat of Object.values(parsed.traits)) {
      expect(Number.isFinite(stat.min)).toBe(true)
      expect(Number.isFinite(stat.max)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @ink-garden/engine test cli`
Expected: FAIL. `Cannot find module src/cli/dump.ts`.

- [ ] **Step 3: Implement the dump CLI**

`packages/engine/src/cli/dump.ts`:

```ts
import {
  SPECIES,
  express,
  founderGenome,
  genomeId,
  serialiseGenome,
  type SpeciesTemplate,
} from '../index.ts'

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === undefined || !token.startsWith('--')) continue
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) continue
    args[token.slice(2)] = value
    i += 1
  }
  return args
}

function findSpecies(id: string): SpeciesTemplate {
  const found = SPECIES.find((s) => s.id === id)
  if (found === undefined) {
    throw new Error(
      `Unknown species "${id}". Known: ${SPECIES.map((s) => s.id).join(', ')}`,
    )
  }
  return found
}

const args = parseArgs(process.argv.slice(2))
const speciesId = args['species'] ?? 'rosemary'
const seed = args['seed'] ?? 'unnamed'
const species = findSpecies(speciesId)
const genome = founderGenome(species, seed)

process.stdout.write(
  `${JSON.stringify(
    {
      species: species.id,
      binomial: species.binomial,
      lineage: species.lineage,
      lifecycle: species.lifecycle,
      seed,
      genomeId: genomeId(genome),
      genome: JSON.parse(serialiseGenome(genome)) as unknown,
      phenotype: express(genome),
    },
    null,
    2,
  )}\n`,
)
```

- [ ] **Step 4: Implement the descendants CLI**

`packages/engine/src/cli/descendants.ts`:

```ts
import {
  SPECIES,
  express,
  founderGenome,
  reproduce,
  type Genome,
  type SpeciesTemplate,
} from '../index.ts'

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === undefined || !token.startsWith('--')) continue
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      args[token.slice(2)] = next
      i += 1
    } else {
      args[token.slice(2)] = 'true'
    }
  }
  return args
}

function findSpecies(id: string): SpeciesTemplate {
  const found = SPECIES.find((s) => s.id === id)
  if (found === undefined) {
    throw new Error(`Unknown species "${id}". Known: ${SPECIES.map((s) => s.id).join(', ')}`)
  }
  return found
}

interface Stat {
  min: number
  max: number
  mean: number
  variance: number
}

function statistic(values: readonly number[]): Stat {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, variance: 0 }
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let sum = 0
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  const mean = sum / values.length
  let sq = 0
  for (const v of values) sq += (v - mean) * (v - mean)
  return { min, max, mean, variance: sq / values.length }
}

const args = parseArgs(process.argv.slice(2))
const species = findSpecies(args['species'] ?? 'rosemary')
const count = Number.parseInt(args['count'] ?? '60', 10)
const generations = Number.parseInt(args['generations'] ?? '8', 10)
const asJson = args['json'] === 'true'

/**
 * Breed a closed population for N generations, choosing parents
 * deterministically. This is a plausibility check for the art gate, not a
 * simulation of a user's choices.
 */
let population: Genome[] = Array.from({ length: count }, (_, i) =>
  founderGenome(species, `${species.id}-founder-${i}`),
)

for (let generation = 0; generation < generations; generation += 1) {
  const next: Genome[] = []
  for (let i = 0; i < count; i += 1) {
    const a = population[i % population.length]
    const b = population[(i * 7 + 3) % population.length]
    if (a === undefined || b === undefined) continue
    next.push(reproduce(`${species.id}-g${generation}-${i}`, a, b))
  }
  population = next
}

const perTrait = new Map<string, number[]>()
for (const genome of population) {
  const phenotype = express(genome)
  for (const [trait, value] of Object.entries(phenotype.quantitative)) {
    const bucket = perTrait.get(trait)
    if (bucket === undefined) perTrait.set(trait, [value])
    else bucket.push(value)
  }
}

const traits: Record<string, Stat> = {}
for (const [trait, values] of [...perTrait.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  traits[trait] = statistic(values)
}

const result = { species: species.id, generations, sampleSize: population.length, traits }

if (asJson) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else {
  const lines = [`${species.commonName} — ${generations} generations, n=${population.length}`, '']
  for (const [trait, stat] of Object.entries(traits)) {
    lines.push(
      `${trait.padEnd(26)} min ${stat.min.toFixed(2).padStart(8)}  ` +
        `mean ${stat.mean.toFixed(2).padStart(8)}  ` +
        `max ${stat.max.toFixed(2).padStart(8)}  ` +
        `var ${stat.variance.toFixed(3)}`,
    )
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}
```

- [ ] **Step 5: Run the CLIs by hand and read the output**

```bash
cd packages/engine
node src/cli/dump.ts --species rosemary --seed Lupin
node src/cli/descendants.ts --species rosemary --generations 10
node src/cli/descendants.ts --species jacaranda --generations 10
```

Expected: `dump` prints readable JSON. `descendants` prints a trait table. Check by eye that **no trait drifts to absurd values over ten generations** and that means move toward the species' intended character. This is the first real signal on the art gate's precondition. Note anything surprising for M0b.

- [ ] **Step 6: Verify the JavaScriptCore cross-check**

Requires Bun on PATH. If Bun is not installed, skip this step and note it, but do
not skip it permanently: it is the only automated proof that a genome does not
depend on which device produced it.

```bash
cd packages/engine
node src/cli/dump.ts --species jacaranda --seed Lupin > /tmp/dump-node.json
bun src/cli/dump.ts --species jacaranda --seed Lupin > /tmp/dump-bun.json
diff /tmp/dump-node.json /tmp/dump-bun.json && echo "IDENTICAL across V8 and JSC"
```

Expected: **IDENTICAL.** This is the payoff of the integer-only RNG. If the files differ, the RNG has a floating-point dependency and that must be fixed before proceeding, because it means a plant's genome depends on which device produced it.

- [ ] **Step 7: Write the README**

`packages/engine/README.md`:

```markdown
# @ink-garden/engine

Pure, dependency-free, isomorphic genetics for Ink Garden. Runs identically in
browsers, in Node and in Bun.

## The three layers

    genotype    allele pairs, parallel to LOCI
        │ express(genome)
    phenotype   discrete traits + polygenic quantitative traits
        │ reproduce(childName, parentA, parentB)
    genotype

Geometry, time and weather are **not** here. This package has no notion of a
plant's appearance.

## Determinism

Same inputs, same output, forever, on every device. All randomness is
integer-only, which is why `node src/cli/dump.ts` and `bun src/cli/dump.ts`
produce byte-identical output even though Node runs V8 and Bun runs
JavaScriptCore. Do not introduce `Math.random`, `Math.sin` or floating-point
accumulation into allele derivation.

## Commands

    pnpm test                     all tests
    pnpm typecheck                tsc --noEmit, the only type check there is
    pnpm dump --species rosemary --seed Lupin
    pnpm descendants --species jacaranda --generations 10

## Adding a locus

1. Append to `LOCI` in `src/loci.ts`.
2. That is all. `migrateGenome` fills the new locus for existing plants
   deterministically from the plant's own identity, so nobody's rose changes
   appearance when the catalogue grows.

## Adding a species

Add a `SpeciesTemplate` to `src/species.ts` and list it in `SPECIES`. Only
declare the distributions that make the species distinctive; everything else
falls back to `defaultDistribution`.
```

- [ ] **Step 8: Run everything**

Run: `pnpm --filter @ink-garden/engine test && pnpm --filter @ink-garden/engine typecheck && pnpm test`
Expected: PASS, all suites. Typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/cli packages/engine/test/cli.test.ts packages/engine/README.md
git commit -m "feat(engine): dump and descendants CLIs, plus the engine README

M0a complete: a seed string becomes a genome, a genome becomes a phenotype,
and two genomes produce a child. Geometry, thermal time and species appearance
are M0b and M0c."
```

---

## Notes for whoever writes M0b

Discovered while planning, recorded so M0b does not have to rediscover them:

1. **Quantisation belongs in M0b, not M0a.** The spec already places it at the phenotype→structure boundary (§16), which is M0b. Phenotype values here are integers and exact sums, so nothing needs quantising yet.
2. **`express` returns `flower.fertility`,** driven by the doubling rule. M0b should use it to weight seed set rather than inventing its own rule.
3. **`SpeciesTemplate.thermalBase` and `thermalConstant` are already on the template** and unused by M0a. M0b's thermal time model consumes them directly.
4. **`reproduce` takes a name, not a genome pair alone.** Changing the child's name changes its alleles, because the name is the salt. That is intended: naming a child is choosing a roll.
5. **The `descendants` CLI is the plausibility harness for the art gate.** M0c should extend it with a rendering pass so a thousand descendants can be looked at rather than just measured.

## Self-Review

**Spec coverage.** §4.1 hierarchy: the catalogue's master identity loci plus modifiers, and `flower.doubling` is the homeotic switch. §4.2 catalogue: Task 2, with all ten required modules asserted. §4.3 inheritance: Task 5 for `blend`, Task 6 for polygenic additivity. §4.4 epistasis: Task 7, one test per rule including the delphinidin-plus-copigment-plus-pH blue path and the doubling fertility cost. §4.5 mutation: Task 8, plus a rate test. §4.6 versioning: Task 3, with migration determinism and idempotence. §6.2 crossing and §6.3 selfing: Task 8. §6.7 ploidy: `ploidy` is not in `Genome` yet, which is correct — it is deferred and M0a is diploid throughout. §16 determinism: the integer-only RNG plus the Node-versus-Bun diff step in Task 11.

**Gaps acknowledged.** Species *appearance* is not covered here by design; that is M0c. `blend` values in the catalogue are first-pass and will be tuned once `resolveDiscrete` output can be looked at. **The catalogue is 78 loci, not the "approximately 60" the spec estimates** (spec §4.2): 25 discrete and 53 quantitative. Every extra locus is tuning surface, so if M0c finds the catalogue unwieldy, the fix is deleting loci rather than adding them, and the four species templates only declare what distinguishes them, so an unused locus costs almost nothing at runtime. Reconciliation belongs in the spec at revision 5.

**Placeholder scan.** No TBD, no "similar to Task N", no "add error handling". Every code step contains the code.

**Type consistency.** `Genome.alleles` is `readonly (readonly [Allele, Allele])[]` throughout; `express` returns `Phenotype` while `applyEpistasis` takes and returns `MutablePhenotype`, and `express` converts by constructing the mutable object first. `resolveDiscrete` takes `DiscreteLocus` and returns `DiscreteTrait` in both Tasks 5 and 6. `quantitativeTraits()` lives only in `loci.ts` and is exported from there. `DERIVED_TRAITS` is declared in Task 6 and asserted in Task 6's test. `meiosis(parent, childName, side)` has the same signature in Task 8's test and implementation.
