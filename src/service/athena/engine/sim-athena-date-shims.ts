import type { DatabaseSync } from "node:sqlite";

import {
  shimNumber,
  shimText,
  simAthenaScalarShim,
} from "./sim-athena-shim-registry.js";

/** How much of an ISO-8601 timestamp each unit keeps. */
const truncations: ReadonlyMap<string, number> = new Map([
  ["year", 4],
  ["month", 7],
  ["day", 10],
  ["hour", 13],
  ["minute", 16],
  ["second", 19],
]);

/**
 * The start of the year, laid out so that every digit of an ISO-8601 timestamp
 * has the value truncating to it leaves behind.
 */
const startOfYear = "0000-01-01T00:00:00.000";

/** The `date_format` patterns Trino shares with MySQL. */
const formatFields: ReadonlyMap<string, [number, number]> = new Map([
  ["%Y", [0, 4]],
  ["%m", [5, 7]],
  ["%d", [8, 10]],
  ["%H", [11, 13]],
  ["%i", [14, 16]],
  ["%S", [17, 19]],
]);

/**
 * Trino's date and time functions, over ISO-8601 text.
 *
 * A timestamp is text here, because that is how JSON and CSV carry one and
 * because SQLite has no date type of its own. Every one of these therefore
 * works on the string rather than on an instant, which is exact for the
 * ISO-8601 a table holds and does nothing useful for anything else.
 *
 * `date_trunc` zeroes the fields below the unit and keeps the separators the
 * value was written with. A date comes back as a date and a timestamp comes
 * back as a timestamp at the start of the unit, which is what Trino does.
 */
export function simAthenaInstallDateShims(database: DatabaseSync): void {
  simAthenaScalarShim(
    database,
    "from_iso8601_timestamp",
    (value) => shimText(value) ?? null,
  );
  simAthenaScalarShim(
    database,
    "from_iso8601_date",
    (value) => shimText(value)?.slice(0, 10) ?? null,
  );
  simAthenaScalarShim(
    database,
    "to_iso8601",
    (value) => shimText(value) ?? null,
  );
  simAthenaScalarShim(database, "date_trunc", (unit, value) =>
    truncated(shimText(unit), shimText(value)),
  );
  simAthenaScalarShim(database, "date_format", (value, format) =>
    formatted(shimText(value), shimText(format)),
  );
  simAthenaScalarShim(database, "from_unixtime", (seconds) => {
    const epoch = shimNumber(seconds);

    return epoch === undefined
      ? null
      : new Date(epoch * 1000).toISOString().replace("T", " ").slice(0, 23);
  });
  simAthenaScalarShim(database, "to_unixtime", (value) => {
    const parsed = Date.parse(shimText(value) ?? "");

    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  });
}

function truncated(
  unit: string | undefined,
  value: string | undefined,
): string | null {
  if (value === undefined) {
    return null;
  }

  const keep = truncations.get(unit?.toLowerCase() ?? "");

  if (keep === undefined || value.length <= keep) {
    return value;
  }

  let truncatedValue = value.slice(0, keep);

  for (let index = keep; index < value.length; index += 1) {
    const character = value.charAt(index);

    truncatedValue += /\d/u.test(character)
      ? startOfYear.charAt(index) || "0"
      : character;
  }

  return truncatedValue;
}

function formatted(
  value: string | undefined,
  format: string | undefined,
): string | null {
  if (value === undefined || format === undefined) {
    return null;
  }

  return format.replaceAll(/%[A-Za-z%]/gu, (field) => {
    if (field === "%%") {
      return "%";
    }

    const range = formatFields.get(field);

    return range === undefined ? field : value.slice(range[0], range[1]);
  });
}
