import type { SimAthenaSqlParser } from "./sim-athena-parser-module.js";
import {
  simAthenaSqlForParser,
  simAthenaSqlForSqlite,
} from "./sim-athena-sql-rewrites.js";

/**
 * One Athena statement written back out for SQLite, or nothing where it cannot
 * be.
 *
 * A statement the Athena grammar refuses and one the parser cannot write back
 * out both land the same way, because the engine has one answer to either:
 * turn the query down and let the declared result take it. Nothing is reported
 * from here, since a query the engine cannot run is an ordinary thing for a
 * test to write rather than a fault.
 */
export function simAthenaSqliteSql(
  parser: SimAthenaSqlParser,
  athenaSql: string,
): string | undefined {
  try {
    const ast = parser.astify(simAthenaSqlForParser(athenaSql), {
      database: "athena",
    });

    return simAthenaSqlForSqlite(parser.sqlify(ast, { database: "sqlite" }));
  } catch {
    return undefined;
  }
}
