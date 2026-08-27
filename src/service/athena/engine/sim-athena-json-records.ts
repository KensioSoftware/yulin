// A decoded record is keyed by whatever the object held, so every read of one
// is by a name worked out at run time.
// oxlint-disable security/detect-object-injection
import type { SimAthenaEngineRow } from "./sim-athena-engine-row.js";

/**
 * How one table's JSON records reach its columns.
 *
 * `mappings` holds the column names the OpenX SerDe's `mapping.<column>`
 * parameters declare, each against the record key it reads. A table declaring
 * none leaves it empty, and every column is read by its own name.
 *
 * `caseInsensitive` is the SerDe's own `case.insensitive`, on unless a table
 * turns it off. The SerDe folds a record's keys before looking one up. A
 * mapping matches a key of any case until a table declares `FALSE`.
 */
export interface SimAthenaJsonFormat {
  readonly mappings: ReadonlyMap<string, string>;
  readonly caseInsensitive: boolean;
}

/**
 * One object of JSON lines, read into rows.
 *
 * A nested object or array is kept as its JSON text, which is what makes
 * `json_extract_scalar` and `cardinality` reach into it.
 */
export function simAthenaJsonRows(
  text: string,
  format: SimAthenaJsonFormat,
): readonly SimAthenaEngineRow[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SimAthenaEngineRow)
    .map((record) => mappedRow(record, format));
}

/**
 * One record with its mapped columns laid over it.
 *
 * The record is kept whole underneath. A column no mapping names still reads
 * by its own name. A mapped column is written whether or not the record
 * carries the key, since the mapping is where that column reads from.
 */
function mappedRow(
  record: SimAthenaEngineRow,
  format: SimAthenaJsonFormat,
): SimAthenaEngineRow {
  if (format.mappings.size === 0) {
    return record;
  }

  const row: Record<string, unknown> = { ...record };

  for (const [column, key] of format.mappings) {
    row[column] = mappedValue(record, key, format.caseInsensitive);
  }

  return row;
}

function mappedValue(
  record: SimAthenaEngineRow,
  key: string,
  caseInsensitive: boolean,
): unknown {
  const exact = record[key];

  if (exact !== undefined) {
    return exact;
  }

  if (!caseInsensitive) {
    return null;
  }

  const wanted = key.toLowerCase();

  for (const [held, value] of Object.entries(record)) {
    if (held.toLowerCase() === wanted) {
      return value;
    }
  }

  return null;
}
