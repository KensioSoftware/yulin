// A decoded record is keyed by whatever the object held, so every read of one
// is by a name worked out at run time.
// oxlint-disable security/detect-object-injection

/** One decoded record, keyed by column name. */
export type SimAthenaEngineRow = Readonly<Record<string, unknown>>;

/**
 * One value out of a decoded record, by column name.
 *
 * Hive column names are case insensitive and the JSON and CSV a table sits on
 * need not agree with the case Glue holds. An exact match wins, and anything
 * else is matched with the case taken off.
 */
export function simAthenaRowValue(
  row: SimAthenaEngineRow,
  name: string,
): unknown {
  const exact = row[name];

  if (exact !== undefined) {
    return exact;
  }

  const wanted = name.toLowerCase();

  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }

  return undefined;
}
