# @ink-garden/engine

Pure, dependency-free, isomorphic genetics for Ink Garden. Runs identically in
browsers, in Node and in Bun.

## The layers

```
genome         diploid allele pairs, parallel to LOCI
    │ express(genome)
phenotype      blend resolution, polygenic sums, epistasis
    │ expressPlant(genome, species)
plant          species baselines, canalisation resolved
    │ reproduce(childName, parentA, parentB)
genome
```

Geometry, thermal time and weather are **not** here. This package has no notion
of a plant's appearance or of time passing.

`express` deliberately does not invent a petal count, because petal number is a
species trait. Anything that needs a real plant should call `expressPlant`.

## Determinism

Same inputs, same output, forever, on every device.

All randomness is integer-only, which is why `node src/cli/dump.ts` and
`bun src/cli/dump.ts` produce **byte-identical** output even though Node runs V8
and Bun runs JavaScriptCore. Do not introduce `Math.random`, `Math.sin` or
floating-point accumulation into allele derivation.

Verified: 14,646 byte JSON identical across both engines, and identical
descendant statistics after ten generations of breeding.

## What the biology forced

Three things in here are modelled from published work rather than invented, and
they are the parts most likely to be "simplified" by mistake later.

**Traits have three architectures.** Every discrete locus is `canalised`,
`polymorphic` or `homeotic`, and the default allele distribution follows. Real
populations are mostly monomorphic with a tail of rarer variants; uniform
defaults make every unusual trait about 50% likely, which produced a mutant
heap rather than a garden in the first pass.

**Petal number is canalised, not polygenic.** Floral development is robust
enough that organ number does not vary, and that robustness actively suppresses
variation the genome carries — "cryptic genetic variation" (Monniaux et al.
2016, *Ann Bot*). `petal.count` therefore comes from the species baseline, and
`petal.variance` is silent until `flower.canalisation` is lost. When it is lost
the variation is expressed as petal **loss**, which is the published case:
*Cardamine hirsuta* ranges from four petals down to zero (Rambaud-Lavigne et al.
2025, *Quant Plant Biol*). **Zero petals is a correct phenotype, not a bug.**

**Green flowers are uncommon in nature** and arise from chlorophyll retention
via regulatory and homeotic changes rather than from a simple dominant allele
(Li et al. 2026, *Hortic Res*). Hence `pigment.petal.chlorophyll` is a rare
homeotic locus, and chlorophyll *absorbs* rather than repaints when other
pigments are present.

Phenology is heritable but bounded around the species value, so a breeder can
select an early or late line without a species losing its character.

## Commands

```bash
pnpm test                                   # all tests
pnpm typecheck                              # tsc --noEmit, the only type check there is
pnpm dump --species rosemary --seed Lupin   # genome, genomic phenotype, plant
pnpm descendants --species jacaranda --generations 10
pnpm descendants --species rosemary --json  # machine-readable statistics
```

`descendants` is the plausibility harness for the art gate: it breeds a closed
population for N generations and reports the range each trait reaches, which is
how we check that recombination does not drift into nonsense.

## Adding a locus

1. Append to `LOCI` in `src/loci.ts`, giving it an `architecture`.
2. That is almost all. `migrateGenome` fills the new locus for existing plants
   deterministically from the plant's own identity, so nobody's rose changes
   appearance when the catalogue grows.
3. If the trait needs a species scale, add the field to `PhenotypeBaseline` and
   map it in `SCALED_BY_BASELINE` in `src/phenotype.ts`.

## Adding a species

Add a `SpeciesTemplate` to `src/species.ts` and list it in `SPECIES`. Declare
only the distributions that make the species distinctive; everything else falls
back to the architecture-aware default.

Note that all four founding species are perennials, so nothing yet exercises
the annual or biennial lifecycle. A fast annual belongs in the founding set at
M0c for that reason.
