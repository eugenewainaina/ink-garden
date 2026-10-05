# Ink Garden

A garden of procedurally grown plants with real genomes. Each plant is a
simulated organism: it inherits traits from its parents, develops from a
meristem under the influence of real weather at a chosen place, blooms on a
schedule driven by accumulated warmth, sets seed, goes dormant, and returns
larger the following season.

Design-first at the moment. The specification and the plan came before the code,
and the engine exists but there is no app around it yet.

## Where things are

| Path | What it is |
|---|---|
| `docs/superpowers/specs/2026-10-03-flower-garden-design.md` | The design. Genome, development, weather, data model, milestones, and the reasoning behind each choice |
| `docs/superpowers/plans/2026-10-03-m0a-engine-core.md` | The M0a implementation plan, task by task |
| `packages/engine` | The genetics engine. Pure TypeScript, no runtime dependencies, isomorphic |
| `inspo/` | Visual references, with attribution |

## Running the engine

```bash
pnpm install
pnpm test
pnpm typecheck

cd packages/engine
node src/cli/descendants.ts --species rosemary --generations 10
node src/cli/dump.ts --species jacaranda --seed Lupin
```

Requires Node 24 or later. Bun is optional and used only to cross-check
determinism: the engine must produce byte-identical output under Node (V8) and
Bun (JavaScriptCore), because a plant's genome must not depend on which device
produced it.

## Milestones

M0 is split three ways because each part produces working, testable software on
its own.

| | | |
|---|---|---|
| **M0a** | Engine core: genome, phenotype, reproduction | **Done** |
| **M0b** | Development: thermal time, meristem simulation, allometry | Next |
| **M0c** | Rendering, the four species, the gallery, and the art gate | |
| M1-M8 | Growth, PWA, breeding UI, sync, weather, garden, pollinators, notifications | |

The art gate at M0c is the real test: if generated plants are not plausible at
every age, nothing downstream is worth building.

## Guard rails

The engine contains no AI, no advertising, no analytics and no engagement
mechanics, by design. Those are not preferences; they are constraints with
reasons recorded in the spec.

There is a pre-push hook that refuses to push any commit containing a term from
`.forbidden-terms.txt`. That list is deliberately **not** committed, because a
committed list of forbidden names would itself be the leak. The hook fails
closed: with no term list present it refuses to push rather than silently
checking nothing.

Set it up once per clone:

```bash
git config core.hooksPath .githooks
cp .forbidden-terms.example.txt .forbidden-terms.txt
$EDITOR .forbidden-terms.txt
```
