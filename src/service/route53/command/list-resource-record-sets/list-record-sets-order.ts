import type { SimRoute53Record } from "../../record/sim-route53-record.js";

/**
 * Compare two strings by code unit rather than by locale.
 *
 * Record ordering has to be reproducible wherever the simulator runs, and it
 * has to agree exactly with the order the pagination marker filter applies.
 * `localeCompare` depends on the runtime's default locale and on how the
 * collator weights characters that are legal in DNS labels, hyphens in
 * particular, so ordinal comparison is used throughout record ordering.
 */
export function compareOrdinal(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

/**
 * Compare two normalised Route53 record names in DNS name order.
 *
 * Route53 orders record sets by DNS name, which compares labels from the right
 * rather than lexically from the left. Starting at the trailing label groups
 * every name in a zone together and puts the zone apex first, so
 * `example.test` sorts before `a.example.test`, which sorts before
 * `b.example.test`.
 */
export function compareSimRoute53RecordNames(
  left: string,
  right: string,
): number {
  const leftLabels = left.split(".").toReversed();
  const rightLabels = right.split(".").toReversed();
  const labelCount = Math.max(leftLabels.length, rightLabels.length);

  for (let index = 0; index < labelCount; index += 1) {
    // A missing label sorts first, which puts shorter names before the longer
    // names that extend them.
    const comparison = compareOrdinal(
      leftLabels[index] ?? "",
      rightLabels[index] ?? "",
    );

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

/**
 * Compare two Route53 records by DNS name, then by record type.
 *
 * The record type breaks ties because one name can hold several record types,
 * and pagination markers need a total ordering.
 */
export function compareSimRoute53Records(
  left: SimRoute53Record,
  right: SimRoute53Record,
): number {
  const nameComparison = compareSimRoute53RecordNames(left.name, right.name);

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return compareOrdinal(left.type, right.type);
}
