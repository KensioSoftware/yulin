/**
 * Order strings by their code units, which is what SigV4 means by sorted.
 *
 * A locale-aware comparison is not interchangeable here: it treats punctuation
 * and case as secondary, so it can order `a-b` and `a` the other way round from
 * the signer and produce a canonical form that never matches.
 */
export function compareSigV4ByteOrder(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}
