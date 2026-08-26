import type { DatabaseSync } from "node:sqlite";

import {
  shimNumber,
  shimText,
  simAthenaScalarShim,
} from "./sim-athena-shim-registry.js";

/**
 * How much of an ISO-8601 timestamp each unit keeps, and what has to be put
 * back to leave a timestamp rather than a fragment.
 */
const truncations: ReadonlyMap<string, { keep: number; pad: string }> = new Map(
  [
    ["year", { keep: 4, pad: "-01-01" }],
    ["month", { keep: 7, pad: "-01" }],
    ["day", { keep: 10, pad: "" }],
    ["hour", { keep: 13, pad: ":00:00" }],
    ["minute", { keep: 16, pad: ":00" }],
    ["second", { keep: 19, pad: "" }],
  ],
);

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

  const truncation = truncations.get(unit?.toLowerCase() ?? "");

  return truncation === undefined
    ? value
    : `${value.slice(0, truncation.keep)}${truncation.pad}`;
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
