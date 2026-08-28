import type { DatabaseSync, SQLInputValue, SQLOutputValue } from "node:sqlite";

/** One Trino scalar function, as SQLite will call it. */
export type SimAthenaScalarShim = (
  ...values: SQLOutputValue[]
) => SQLInputValue;

/**
 * Register one Trino scalar function on this database.
 *
 * Every shim takes any number of arguments, because SQLite checks the count
 * against the JavaScript function's own arity otherwise and a Trino function
 * with an optional argument would stop resolving.
 */
export function simAthenaScalarShim(
  database: DatabaseSync,
  name: string,
  implementation: SimAthenaScalarShim,
): void {
  database.function(name, { varargs: true, deterministic: true }, (...values) =>
    withEmptyBytes(implementation(...values)),
  );
}

/**
 * One answer, with an empty `varbinary` written so that SQLite keeps it.
 *
 * `node:sqlite` reads a zero length typed array as SQL NULL where its backing
 * store carries no pointer, and `TextEncoder` answers with exactly that over an
 * empty string. Copying those bytes gives the empty blob back, and `to_utf8('')`
 * then answers the empty `varbinary` Trino answers with rather than a null.
 */
function withEmptyBytes(answered: SQLInputValue): SQLInputValue {
  return answered instanceof Uint8Array && answered.length === 0
    ? Buffer.alloc(0)
    : answered;
}

/**
 * Whether an optional argument was written as an explicit `NULL`.
 *
 * A Trino function answers null when any argument is null, and a call that left
 * the argument out gets the default instead. The two arrive here as the same
 * value, and the count is what tells them apart.
 */
export function isExplicitNull(
  values: readonly SQLOutputValue[],
  index: number,
): boolean {
  return values.length > index && values.at(index) === null;
}

/** One argument as text, or nothing where it is null. */
export function shimText(
  value: SQLOutputValue | undefined,
): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

/** One argument as a number, or nothing where it is not one. */
export function shimNumber(
  value: SQLOutputValue | undefined,
): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * One argument as bytes, or nothing where it is null.
 *
 * The binary functions take a `varbinary`, and Trino refuses text where one is
 * wanted rather than converting it. SQLite has no such analysis to run, so a
 * column of text reaching `sha256` without a `to_utf8` around it is hashed as
 * its UTF-8 bytes, which is what the missing call would have produced.
 */
export function shimBytes(
  value: SQLOutputValue | undefined,
): Uint8Array | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value instanceof Uint8Array
    ? value
    : new TextEncoder().encode(String(value));
}
