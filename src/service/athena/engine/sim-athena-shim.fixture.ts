import { simAthenaSqliteDatabase } from "./sim-athena-sqlite-database.js";
import { simAthenaSqliteModule } from "./sim-athena-sqlite-module.js";

/** The instant every query in these fixtures is taken to have started at. */
export const shimStartedAt = new Date("2026-08-26T17:31:00.000Z");

/**
 * What one expression comes to on the database the engine builds.
 *
 * The database is empty, since a Trino function shim answers from its
 * arguments rather than from a table.
 */
export async function anAnsweredExpression(
  expression: string,
): Promise<unknown> {
  const sqlite = await simAthenaSqliteModule();
  const database = simAthenaSqliteDatabase({
    sqlite,
    loaded: [],
    sessionDatabase: undefined,
    startedAt: shimStartedAt,
  });

  try {
    const answered = database
      .prepare(`SELECT ${expression} AS answered`)
      .get() as { answered: unknown } | undefined;

    return answered?.answered;
  } finally {
    database.close();
  }
}

/**
 * What one aggregate comes to over a column of values.
 *
 * The values are written into the statement rather than into a table, because
 * a table would need a catalog and a Bucket to sit behind it.
 */
export async function anAggregatedExpression(
  expression: string,
  values: readonly (string | number | null)[],
): Promise<unknown> {
  const rows = values
    .map((value) => `SELECT ${literal(value)} AS value`)
    .join(" UNION ALL ");

  return anAnsweredExpression(`(SELECT ${expression} FROM (${rows}))`);
}

function literal(value: string | number | null): string {
  if (value === null) {
    return "NULL";
  }

  return typeof value === "number" ? String(value) : `'${value}'`;
}
