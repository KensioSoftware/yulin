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
  database.function(
    name,
    { varargs: true, deterministic: true },
    implementation,
  );
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
