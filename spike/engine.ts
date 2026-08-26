/**
 * Throwaway query engine for the #1004 spike.
 *
 * Reads a simulated Glue table's metadata, decodes the JSON lines objects
 * under its location out of simulated S3, loads them into an in-memory
 * SQLite database, and answers an Athena query against it.
 *
 * None of this is production shaped. It exists to measure what works.
 */
import { DatabaseSync } from "node:sqlite";

import sqlParser from "node-sql-parser";

const { Parser } = sqlParser;

export type EngineRow = Readonly<Record<string, unknown>>;

export interface LoadedTable {
  readonly databaseName: string;
  readonly tableName: string;
  readonly columns: readonly { name: string; type: string }[];
  readonly rows: readonly EngineRow[];
  readonly bytesScanned: number;
}

/** Athena type to a SQLite column affinity. */
export function sqliteAffinity(athenaType: string | undefined): string {
  const type = (athenaType ?? "string").toLowerCase();

  if (/^(tinyint|smallint|int|integer|bigint)/.test(type)) return "INTEGER";
  if (/^(float|double|real|decimal)/.test(type)) return "REAL";
  if (type.startsWith("boolean")) return "INTEGER";

  return "TEXT";
}

/** Split an s3:// URI into its bucket and key prefix. */
export function parseS3Location(location: string): {
  bucket: string;
  prefix: string;
} {
  const withoutScheme = location.replace(/^s3:\/\//, "");
  const slash = withoutScheme.indexOf("/");

  if (slash === -1) return { bucket: withoutScheme, prefix: "" };

  return {
    bucket: withoutScheme.slice(0, slash),
    prefix: withoutScheme.slice(slash + 1),
  };
}

/**
 * Partition values carried by an object key, Hive style.
 *
 * `logs/year=2026/month=08/part-0.json` gives year 2026 and month 08.
 */
export function hivePartitionValues(key: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const segment of key.split("/")) {
    const equals = segment.indexOf("=");

    if (equals > 0 && !segment.includes(".")) {
      values[segment.slice(0, equals)] = segment.slice(equals + 1);
    }
  }

  return values;
}

async function bodyText(body: unknown): Promise<string> {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);

  const chunks: Uint8Array[] = await Array.fromAsync(
    body as AsyncIterable<Uint8Array>,
  );

  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Read one simulated Glue table's data out of simulated S3.
 */
export async function loadTable(
  simAws: any,
  databaseName: string,
  tableName: string,
): Promise<LoadedTable> {
  const table = simAws.glue().findTable(databaseName, tableName);

  if (table === undefined) {
    throw new Error(
      `SYNTAX_ERROR: line 1:1: Table awsdatacatalog.${databaseName}.${tableName} does not exist`,
    );
  }

  const location = table.storageDescriptor?.Location;

  if (location === undefined) {
    throw new Error(`Table ${databaseName}.${tableName} declares no location`);
  }

  const { bucket, prefix } = parseS3Location(location);
  const listed = await simAws
    .s3()
    .listObjectsV2({ input: { Bucket: bucket, Prefix: prefix } });

  const rows: EngineRow[] = [];
  let bytesScanned = 0;

  for (const object of listed.Contents ?? []) {
    const got = await simAws
      .s3()
      .getObject({ input: { Bucket: bucket, Key: object.Key } });
    const text = await bodyText(got.Body);

    bytesScanned += object.Size ?? text.length;

    const partitionValues = hivePartitionValues(object.Key as string);

    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;

      rows.push({ ...JSON.parse(line), ...partitionValues });
    }
  }

  const columns = [
    ...table.columns.map((column: any) => ({
      name: column.Name,
      type: column.Type ?? "string",
    })),
    ...table.partitionKeys.map((column: any) => ({
      name: column.Name,
      type: column.Type ?? "string",
    })),
  ];

  return { databaseName, tableName, columns, rows, bytesScanned };
}

/**
 * Build an in-memory SQLite database holding the loaded tables.
 */
export function sqliteFor(tables: readonly LoadedTable[]): DatabaseSync {
  const database = new DatabaseSync(":memory:");

  // SQLite's LIKE is case insensitive for ASCII by default and Athena's is
  // case sensitive. Without this a filter matches rows Athena would exclude.
  database.exec("PRAGMA case_sensitive_like = ON");

  const attached = new Set<string>();

  for (const table of tables) {
    if (!attached.has(table.databaseName)) {
      database.exec(`ATTACH ':memory:' AS "${table.databaseName}"`);
      attached.add(table.databaseName);
    }

    const columns = table.columns
      .map((column) => `"${column.name}" ${sqliteAffinity(column.type)}`)
      .join(", ");

    database.exec(
      `CREATE TABLE "${table.databaseName}"."${table.tableName}" (${columns})`,
    );

    const names = table.columns.map((column) => `"${column.name}"`).join(", ");
    const holes = table.columns.map(() => "?").join(", ");
    const insert = database.prepare(
      `INSERT INTO "${table.databaseName}"."${table.tableName}" (${names}) VALUES (${holes})`,
    );

    for (const row of table.rows) {
      insert.run(
        ...table.columns.map((column) => {
          const value = row[column.name];

          if (value === undefined || value === null) return null;
          if (typeof value === "boolean") return value ? 1 : 0;
          if (typeof value === "object") return JSON.stringify(value);

          return value as string | number;
        }),
      );
    }
  }

  return database;
}

/** Trino functions shimmed onto SQLite. */
export function installShims(database: DatabaseSync): void {
  const scalar = (name: string, fn: (...arguments_: any[]) => unknown) => {
    database.function(name, { varargs: true }, fn as any);
  };

  scalar("from_iso8601_timestamp", (value: string) => value);
  scalar("from_iso8601_date", (value: string) => value.slice(0, 10));
  scalar("to_iso8601", (value: string) => value);
  scalar("date_trunc", (unit: string, value: string) => {
    const text = value;

    if (unit === "year") return `${text.slice(0, 4)}-01-01`;
    if (unit === "month") return `${text.slice(0, 7)}-01`;
    if (unit === "day") return text.slice(0, 10);
    if (unit === "hour") return `${text.slice(0, 13)}:00:00`;

    return text;
  });
  scalar("date_format", (value: string, format: string) => {
    const text = value;

    return format
      .replace("%Y", text.slice(0, 4))
      .replace("%m", text.slice(5, 7))
      .replace("%d", text.slice(8, 10));
  });
  scalar("from_unixtime", (seconds: number) =>
    new Date(seconds * 1000).toISOString(),
  );
  scalar("to_unixtime", (value: string) =>
    Math.floor(new Date(value).getTime() / 1000),
  );
  scalar("json_extract_scalar", (json: string, path: string) => {
    const keys = path
      .replace(/^\$\.?/, "")
      .split(".")
      .filter(Boolean);
    let current: unknown = JSON.parse(json);

    for (const key of keys) {
      current = (current as Record<string, unknown>)?.[key];
    }

    return current === undefined || current === null ? null : String(current);
  });
  scalar("cardinality", (value: string) => {
    try {
      return (JSON.parse(value) as unknown[]).length;
    } catch {
      return null;
    }
  });
  scalar("regexp_like", (value: string, pattern: string) =>
    new RegExp(pattern).test(value) ? 1 : 0,
  );
  scalar(
    "split_part",
    (value: string, delimiter: string, index: number) =>
      value.split(delimiter)[index - 1] ?? null,
  );
  scalar(
    "strpos",
    (value: string, search: string) => value.indexOf(search) + 1,
  );
  scalar("element_at", (value: string, index: number) => {
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed)
        ? (parsed[index - 1] ?? null)
        : (parsed[index] ?? null);
    } catch {
      return null;
    }
  });

  database.aggregate("approx_percentile", {
    start: () => JSON.stringify({ values: [], p: 0.5 }),
    step: (accumulator: string, value: unknown, percentile: number) => {
      const state = JSON.parse(accumulator) as { values: number[]; p: number };
      if (value !== null && value !== undefined)
        state.values.push(Number(value));
      if (percentile !== undefined) state.p = percentile;

      return JSON.stringify(state);
    },
    result: (accumulator: string) => {
      const state = JSON.parse(accumulator) as { values: number[]; p: number };
      if (state.values.length === 0) return null;
      const sorted = [...state.values].sort((a, b) => a - b);
      const index = Math.min(
        sorted.length - 1,
        Math.floor(state.p * sorted.length),
      );

      return sorted[index];
    },
  } as any);

  database.aggregate("approx_distinct", {
    start: () => JSON.stringify([]),
    step: (accumulator: string, value: unknown) => {
      const seen = new Set(JSON.parse(accumulator) as unknown[]);
      seen.add(value);

      return JSON.stringify([...seen]);
    },
    result: (accumulator: string) =>
      (JSON.parse(accumulator) as unknown[]).length,
  } as any);
}

const parser = new Parser();

/**
 * Rewrites applied to the Athena statement before it is parsed.
 *
 * Each one closes a gap the `athena` grammar in node-sql-parser has, and
 * each is cheap. `try_cast` is the one that changes meaning, since Athena
 * answers NULL where a cast fails and SQLite has no equivalent.
 */
export function rewriteAthenaSql(sql: string): string {
  return sql
    .replaceAll(/\btry_cast\s*\(/gi, "CAST(")
    .replaceAll(
      /\bOFFSET\s+(\d+)\s+LIMIT\s+(\d+)/gi,
      (_match, offset: string, limit: string) =>
        `LIMIT ${limit} OFFSET ${offset}`,
    );
}

/** Rewrites applied to the SQLite statement before it runs. */
export function rewriteForSqlite(sql: string): string {
  return (
    sql
      // Trino orders nulls last in both directions. SQLite orders them first
      // ascending.
      .replaceAll(/ASC(?=\s*(,|$|\)))/g, "ASC NULLS LAST")
      // Typed date and timestamp literals.
      .replaceAll(/\b(DATE|TIMESTAMP)\s+'([^']+)'/gi, "'$2'")
  );
}

export interface TranslationOutcome {
  readonly ok: boolean;
  readonly stage?: "parse" | "translate" | "execute";
  readonly sqlite?: string;
  readonly rows?: readonly EngineRow[];
  readonly error?: string;
}

/**
 * Parse one Athena statement, re-emit it for SQLite and run it.
 */
export function runAthenaSql(
  database: DatabaseSync,
  athenaSql: string,
): TranslationOutcome {
  let ast;

  try {
    ast = parser.astify(rewriteAthenaSql(athenaSql), { database: "athena" });
  } catch (error) {
    return { ok: false, stage: "parse", error: (error as Error).message };
  }

  let sqlite;

  try {
    sqlite = rewriteForSqlite(parser.sqlify(ast, { database: "sqlite" }));
  } catch (error) {
    return { ok: false, stage: "translate", error: (error as Error).message };
  }

  try {
    return {
      ok: true,
      sqlite,
      rows: database.prepare(sqlite).all(),
    };
  } catch (error) {
    return {
      ok: false,
      stage: "execute",
      sqlite,
      error: (error as Error).message,
    };
  }
}
