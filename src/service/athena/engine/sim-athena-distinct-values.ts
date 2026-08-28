import type { SQLOutputValue } from "node:sqlite";

/**
 * The values one aggregate has seen, as SQLite will carry them between rows.
 *
 * SQLite holds an accumulator as one of its own values rather than as an
 * object, so the set travels as the JSON text of its keys.
 */
export type SimAthenaDistinctValues = string;

/** An empty accumulator, which is what an aggregate over no rows answers from. */
export const noDistinctValues: SimAthenaDistinctValues = "[]";

/**
 * This value with one more added, where it is not null.
 *
 * Trino and SQLite both leave a null out of a distinct count, so a null row
 * adds nothing.
 */
export function withDistinctValue(
  accumulator: SimAthenaDistinctValues,
  value: SQLOutputValue,
): SimAthenaDistinctValues {
  if (value === null) {
    return accumulator;
  }

  const seen = new Set(JSON.parse(accumulator) as string[]);

  seen.add(keyOf(value));

  return JSON.stringify([...seen]);
}

/** How many distinct values this accumulator saw. */
export function countedDistinctValues(
  accumulator: SimAthenaDistinctValues,
): number {
  return (JSON.parse(accumulator) as string[]).length;
}

/**
 * One value as the key that tells it apart from the others.
 *
 * The tag is what keeps the number `1` and the text `'1'` apart, which is how
 * SQLite keeps them apart too. A whole number arrives as a `bigint` or as a
 * `number` by its size alone, so both take the same tag and the same spelling.
 * Bytes are keyed by their hex, since a digest is a blob here and two rows
 * carrying the same digest are one value.
 */
function keyOf(value: Exclude<SQLOutputValue, null>): string {
  if (typeof value === "string") {
    return `s:${value}`;
  }

  return value instanceof Uint8Array
    ? `b:${Buffer.from(value).toString("hex")}`
    : `n:${String(value)}`;
}
