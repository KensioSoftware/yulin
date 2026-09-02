import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import type { SimAthenaSqlParser } from "./sim-athena-parser-module.js";
import {
  simAthenaSqlForParser,
  simAthenaSqlForSqlite,
} from "./sim-athena-sql-rewrites.js";
import {
  simAthenaUnparsedStatement,
  simAthenaUnrewrittenUnnest,
  simAthenaUnwrittenStatement,
} from "./sim-athena-turn-down.js";
import { simAthenaRewriteUnnest } from "./sim-athena-unnest-rewrite.js";

/** One statement translated for SQLite, or why it could not be. */
export type SimAthenaTranslatedSql =
  | { readonly sql: string; readonly turnedDown: undefined }
  | { readonly sql: undefined; readonly turnedDown: string };

interface SimAthenaSqlTranslationRequest {
  readonly parser: SimAthenaSqlParser;
  readonly athenaSql: string;

  /** The catalog tables the statement reads, for the types it names. */
  readonly tables: readonly SimAthenaCatalogTable[];
}

/**
 * One Athena statement written back out for SQLite, or why it cannot be.
 *
 * Three things stop it, and each is told apart because a strict engine fails
 * the query with the reason. The Athena grammar can refuse the statement, an
 * `UNNEST` in it can have no `json_each` to become, and the parser can decline
 * to write the statement back out. A lenient engine answers all three the same
 * way, by turning the query down and letting the declared result take it.
 */
export function simAthenaSqliteSql(
  request: SimAthenaSqlTranslationRequest,
): SimAthenaTranslatedSql {
  const { parser } = request;
  let read;
  let ast;

  try {
    read = simAthenaSqlForParser(request.athenaSql);
    ast = parser.astify(read.sql, { database: "athena" });
  } catch {
    return turnedDown(simAthenaUnparsedStatement);
  }

  try {
    if (
      !simAthenaRewriteUnnest({
        ast,
        ordinality: read.ordinality,
        tables: request.tables,
      })
    ) {
      return turnedDown(simAthenaUnrewrittenUnnest);
    }

    return {
      sql: simAthenaSqlForSqlite(parser.sqlify(ast, { database: "sqlite" })),
      turnedDown: undefined,
    };
  } catch {
    return turnedDown(simAthenaUnwrittenStatement);
  }
}

function turnedDown(reason: string): SimAthenaTranslatedSql {
  return { sql: undefined, turnedDown: reason };
}
