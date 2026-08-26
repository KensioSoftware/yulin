/**
 * Spike criterion 2. What fraction of the corpus parses with the athena
 * dialect and then runs under SQLite.
 */
import { corpus } from "./corpus.js";
import { installShims, runAthenaSql, sqliteFor, type LoadedTable } from "./engine.js";

const tables: LoadedTable[] = [
  {
    databaseName: "rainlytics",
    tableName: "access_logs",
    columns: [
      { name: "ts", type: "string" },
      { name: "url", type: "string" },
      { name: "status", type: "int" },
      { name: "bytes", type: "bigint" },
      { name: "ip", type: "string" },
      { name: "day", type: "string" },
    ],
    rows: [
      { ts: "2026-08-01T10:00:00Z", url: "/", status: 200, bytes: 1200, ip: "a", day: "2026-08-01" },
      { ts: "2026-08-01T10:05:00Z", url: "/pricing", status: 404, bytes: 310, ip: "b", day: "2026-08-01" },
      { ts: "2026-08-01T11:00:00Z", url: "/api/v1/x", status: 500, bytes: 90, ip: "a", day: "2026-08-01" },
      { ts: "2026-08-02T09:00:00Z", url: "/pricing", status: 404, bytes: 305, ip: null, day: "2026-08-02" },
    ],
    bytesScanned: 0,
  },
  {
    databaseName: "shop",
    tableName: "orders",
    columns: [
      { name: "id", type: "int" },
      { name: "customer_id", type: "int" },
      { name: "total", type: "double" },
      { name: "placed_at", type: "string" },
      { name: "status", type: "string" },
    ],
    rows: [
      { id: 1, customer_id: 1, total: 10.5, placed_at: "2026-02-01", status: "paid" },
      { id: 2, customer_id: 1, total: 4, placed_at: "2026-03-01", status: "paid" },
    ],
    bytesScanned: 0,
  },
  {
    databaseName: "shop",
    tableName: "customers",
    columns: [
      { name: "id", type: "int" },
      { name: "name", type: "string" },
      { name: "country", type: "string" },
    ],
    rows: [
      { id: 1, name: "Ana", country: "GB" },
      { id: 2, name: "Bo", country: "IE" },
    ],
    bytesScanned: 0,
  },
  {
    databaseName: "app",
    tableName: "events",
    columns: [
      { name: "id", type: "int" },
      { name: "payload", type: "string" },
      { name: "tags", type: "array<string>" },
      { name: "attrs", type: "map<string,string>" },
    ],
    rows: [
      { id: 1, payload: '{"user":{"id":"u1"}}', tags: '["a","b"]', attrs: '{"source":"web"}' },
    ],
    bytesScanned: 0,
  },
];

const database = sqliteFor(tables);
installShims(database);

const failures: { label: string; stage: string; error: string }[] = [];
let ran = 0;

for (const query of corpus) {
  const outcome = runAthenaSql(database, query.sql);

  if (outcome.ok) {
    ran += 1;
    continue;
  }

  failures.push({
    label: query.label,
    stage: outcome.stage ?? "unknown",
    error: (outcome.error ?? "").replaceAll("\n", " ").slice(0, 100),
  });
}

console.log(`ran ${String(ran)} of ${String(corpus.length)}`);
console.log("");

for (const failure of failures) {
  console.log(`${failure.stage.padEnd(9)} ${failure.label.padEnd(22)} ${failure.error}`);
}
