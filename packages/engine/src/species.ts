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
