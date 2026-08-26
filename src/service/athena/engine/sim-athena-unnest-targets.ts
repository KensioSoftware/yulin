import type { SimAthenaUnnestKind } from "./sim-athena-unnest-source.js";

/** What one name inside an `UNNEST` alias reads once the rewrite is done. */
export interface SimAthenaUnnestTarget {
  /** The name the statement wrote. */
  readonly from: string;

  /** The `json_each` column it reads, or the ordinal position. */
  readonly reads: "key" | "value" | "ordinality";
}

/**
 * The columns `json_each` answers an `UNNEST` alias with.
 *
 * An array gives one value per element and a map gives a key beside it, which
 * is the same pair Athena hands back. `WITH ORDINALITY` adds the position, and
 * `json_each` numbers an array's elements from zero where Athena numbers them
 * from one.
 *
 * An alias naming a different number of columns from the ones available answers
 * with nothing, and so does `WITH ORDINALITY` over a map. `json_each` gives a
 * map's keys rather than its positions, and there is nothing to count from.
 */
export function simAthenaUnnestTargets(
  kind: SimAthenaUnnestKind,
  columns: readonly string[],
  ordinality: boolean,
): readonly SimAthenaUnnestTarget[] | undefined {
  if (ordinality && kind === "map") {
    return undefined;
  }

  const available: SimAthenaUnnestTarget["reads"][] =
    kind === "array" ? ["value"] : ["key", "value"];

  if (ordinality) {
    available.push("ordinality");
  }

  if (columns.length !== available.length) {
    return undefined;
  }

  return columns.map((from, index) => ({
    from,
    reads: available.at(index) ?? "value",
  }));
}
