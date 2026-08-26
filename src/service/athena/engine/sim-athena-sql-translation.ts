import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import type { SimAthenaSqlParser } from "./sim-athena-parser-module.js";
import {
  simAthenaSqlForParser,
  simAthenaSqlForSqlite,
} from "./sim-athena-sql-rewrites.js";
import { simAthenaRewriteUnnest } from "./sim-athena-unnest-rewrite.js";

interface SimAthenaSqlTranslationRequest {
  readonly parser: SimAthenaSqlParser;
  readonly athenaSql: string;

  /** The catalog tables the statement reads, for the types it names. */
  readonly tables: readonly SimAthenaCatalogTable[];
}

/**
 * One Athena statement written back out for SQLite, or nothing where it cannot
 * be.
 *
 * A statement the Athena grammar refuses, one carrying an `UNNEST` that cannot
 * become a `json_each`, and one the parser cannot write back out all land the
 * same way. The engine has one answer to any of them, which is to turn the
 * query down and let the declared result take it. Nothing is reported from
 * here, since a query the engine cannot run is an ordinary thing for a test to
 * write.
 */
export function simAthenaSqliteSql(
  request: SimAthenaSqlTranslationRequest,
): string | undefined {
  const { parser } = request;

  try {
    const read = simAthenaSqlForParser(request.athenaSql);
    const ast = parser.astify(read.sql, { database: "athena" });

    if (
      !simAthenaRewriteUnnest({
        ast,
        ordinality: read.ordinality,
        tables: request.tables,
      })
    ) {
      return undefined;
    }

    return simAthenaSqlForSqlite(parser.sqlify(ast, { database: "sqlite" }));
  } catch {
    return undefined;
  }
}
