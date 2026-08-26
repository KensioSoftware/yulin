/**
 * Spike criterion 3. Queries that succeed under SQLite and answer
 * differently from Athena.
 *
 * SQLite's answer is measured here. The Athena answer beside it comes from
 * the Trino documentation and is not executed, so each row is a claim to
 * check before it reaches a docs page.
 */
import { installShims, rewriteForSqlite, sqliteFor, type LoadedTable } from "./engine.js";

const tables: LoadedTable[] = [
  {
    databaseName: "d",
    tableName: "t",
    columns: [
      { name: "n", type: "int" },
      { name: "s", type: "string" },
    ],
    rows: [
      { n: 1, s: "Alpha" },
      { n: null, s: "beta" },
      { n: 3, s: null },
    ],
    bytesScanned: 0,
  },
];

const database = sqliteFor(tables);
installShims(database);

const probes: [string, string, string][] = [
  ["boolean output", `SELECT (n >= 2) AS v FROM d.t WHERE n = 3`, "true"],
  ["null order ascending", `SELECT n FROM d.t ORDER BY n ASC`, "1, 3, NULL (nulls last)"],
  ["null order ascending, rewritten", rewriteForSqlite(`SELECT n FROM d.t ORDER BY n ASC`), "1, 3, NULL (nulls last)"],
  ["null order descending", `SELECT n FROM d.t ORDER BY n DESC`, "3, 1, NULL (nulls last)"],
  ["divide by zero", `SELECT 1 / 0 AS v`, "query fails: Division by zero"],
  ["cast of bad text", `SELECT CAST('abc' AS INTEGER) AS v`, "query fails: Cannot cast"],
  ["like case sensitivity", `SELECT count(*) AS v FROM d.t WHERE s LIKE 'alpha'`, "0 (LIKE is case sensitive)"],
  ["concat a number", `SELECT 1 || 'x' AS v`, "query fails: no operator || for integer"],
  ["integer division", `SELECT 5 / 2 AS v`, "2"],
  ["round half", `SELECT round(0.5) AS a, round(1.5) AS b`, "1 and 2"],
  ["avg of integers", `SELECT avg(n) AS v FROM d.t`, "2.0"],
  ["string length of null", `SELECT length(s) AS v FROM d.t WHERE n = 3`, "NULL"],
  ["modulo of a negative", `SELECT -7 % 3 AS v`, "-1"],
];

for (const [label, sql, athena] of probes) {
  let sqlite: string;

  try {
    sqlite = JSON.stringify(database.prepare(sql).all());
  } catch (error) {
    sqlite = `FAILS: ${String((error as Error).message).slice(0, 45)}`;
  }

  console.log(`${label.padEnd(32)} sqlite ${sqlite.padEnd(46)} athena ${athena}`);
}
