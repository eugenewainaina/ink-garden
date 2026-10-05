import { createGenome, type Genome } from '../src/genome.ts'
import { LOCI, locusIndex } from '../src/loci.ts'

/**
 * A genome carrying the **reference** allele at every locus.
 *
 * Not "all zeros". Index 0 is the mutant on the homeotic loci, because allele
 * order is the dominance series and a recessive mutant has to sit below the
 * normal allele. A genome of zeros is therefore a plant homozygous for double
 * flowers, green petals and petaloid sepals, which is a confusing thing for a
 * test to call "flat".
 */
export function referenceGenome(): Genome {
  return createGenome(
    LOCI.map((locus) => {
      const reference = locus.kind === 'discrete' ? (locus.referenceAllele ?? 0) : 0
      return [reference, reference] as const
    }),
  )
}

function discreteAlleleIndex(locusId: string, allele: string): number {
  const locus = LOCI[locusIndex(locusId)]
  if (locus === undefined || locus.kind !== 'discrete') {
    throw new Error(`${locusId} is not a discrete locus`)
  }
  const index = locus.alleles.indexOf(allele)
  if (index < 0) {
    throw new Error(`Unknown allele "${allele}" for ${locusId}; have ${locus.alleles.join(', ')}`)
  }
  return index
}

/**
 * Set a discrete locus by allele **name**. Names survive reordering, indices do
 * not, and reordering is exactly what happens when a locus turns out to need a
 * different dominance.
 */
export function setAlleleByName(
  genome: Genome,
  locusId: string,
  a: string,
  b: string,
): Genome {
  const target = locusIndex(locusId)
  const ia = discreteAlleleIndex(locusId, a)
  const ib = discreteAlleleIndex(locusId, b)
  return createGenome(
    genome.alleles.map((pair, i) => (i === target ? ([ia, ib] as const) : pair)),
  )
}

/** Set a quantitative locus, whose alleles are 0 and 1 by definition. */
export function setQuantitative(
  genome: Genome,
  locusId: string,
  a: number,
  b: number,
): Genome {
  const target = locusIndex(locusId)
  return createGenome(
    genome.alleles.map((pair, i) => (i === target ? ([a, b] as const) : pair)),
  )
}
