// A record is keyed by the table's own column names, so every write of one is
// by a name worked out at run time.
// oxlint-disable security/detect-object-injection
import type { SimAthenaEngineRow } from "./sim-athena-engine-row.js";

/** How one table's delimited text is written. */
export interface SimAthenaDelimitedFormat {
  readonly delimiter: string;
  readonly quote: string | undefined;
  readonly escape: string | undefined;
  readonly skipHeaderLines: number;
}

/**
 * What Hive writes for a null in delimited text.
 *
 * An empty field reads as null too. Delimited text cannot tell an empty string
 * from an absent value, and a query filtering or summing a numeric column is
 * better served by a null than by a string SQLite cannot convert.
 */
const hiveNull = String.raw`\N`;

/**
 * One object of delimited text, read into rows.
 *
 * The columns are taken in the order the table declares them, since delimited
 * text carries no names of its own. A record with more fields than the table
 * has columns loses the surplus, and one with fewer leaves the rest null,
 * which is what Hive does with a ragged file.
 */
export function simAthenaDelimitedRows(
  text: string,
  format: SimAthenaDelimitedFormat,
  columns: readonly string[],
): readonly SimAthenaEngineRow[] {
  return delimitedRecords(text, format)
    .slice(format.skipHeaderLines)
    .map((fields) => rowOf(fields, columns));
}

function rowOf(
  fields: readonly string[],
  columns: readonly string[],
): SimAthenaEngineRow {
  const row: Record<string, unknown> = {};

  for (const [index, column] of columns.entries()) {
    const field = fields[index];

    row[column] =
      field === undefined || field === hiveNull || field.length === 0
        ? null
        : field;
  }

  return row;
}

/**
 * The records one object holds, split on the delimiter and the line endings.
 *
 * Written as a scan rather than a split because a quoted field can carry both
 * of those, and a CSV export of a URL or a log message routinely does.
 */
function delimitedRecords(
  text: string,
  format: SimAthenaDelimitedFormat,
): readonly (readonly string[])[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    const next = index + 1 < text.length ? text.charAt(index + 1) : undefined;

    if (quoted) {
      if (
        next !== undefined &&
        character === format.escape &&
        format.escape !== format.quote
      ) {
        field += next;
        index += 1;
      } else if (character === format.quote && next === format.quote) {
        field += format.quote;
        index += 1;
      } else if (character === format.quote) {
        quoted = false;
      } else {
        field += character;
      }

      continue;
    }

    if (character === format.quote && field.length === 0) {
      quoted = true;
    } else if (character === format.delimiter) {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}
