/**
 * What a `GetPartitions` `Expression` comes to once it has been read.
 *
 * A filter answers for one partition's values, in the order the table declares
 * its partition keys. Everything a refusal could catch is caught while the
 * expression is read, so a filter only ever answers yes or no.
 */
export type SimGluePartitionFilter = (values: readonly string[]) => boolean;

/** A filter holding only where every one of these holds. */
export function simGlueAllOf(
  filters: readonly SimGluePartitionFilter[],
): SimGluePartitionFilter {
  return (values): boolean => filters.every((filter) => filter(values));
}

/** A filter holding where any one of these holds. */
export function simGlueAnyOf(
  filters: readonly SimGluePartitionFilter[],
): SimGluePartitionFilter {
  return (values): boolean => filters.some((filter) => filter(values));
}

/** A filter holding exactly where this one does not. */
export function simGlueNotFilter(
  filter: SimGluePartitionFilter,
): SimGluePartitionFilter {
  return (values): boolean => !filter(values);
}
