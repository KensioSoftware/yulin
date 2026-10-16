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
import { simAthenaRejectedStatement } from "./sim-athena-rejected-statement.js";
import { simAthenaRewriteCasts } from "./sim-athena-cast-rewrite.js";
import { simAthenaRoundScales } from "./sim-athena-round-scales.js";
import {
  simAthenaRejectedSql,
  simAthenaTranslated,
  simAthenaTurnedDownSql,
  type SimAthenaTranslatedSql,
} from "./sim-athena-translated-sql.js";
import { simAthenaRewriteUnnest } from "./sim-athena-unnest-rewrite.js";

interface SimAthenaSqlTranslationRequest {
  readonly parser: SimAthenaSqlParser;
  readonly athenaSql: string;

  /** The catalog tables the statement reads, for the types it names. */
  readonly tables: readonly SimAthenaCatalogTable[];
}

/**
 * One Athena statement written back out for SQLite, or why it is not.
 *
 * Three things turn the query down, and each is told apart because a strict
 * engine fails the query with the reason. The Athena grammar can refuse the
 * statement, an `UNNEST` in it can have no `json_each` to become, and the
 * parser can decline to write the statement back out. A lenient engine answers
 * all three the same way, by letting the declared result take the query.
 *
 * A rejection is the fourth outcome and a different thing. The statement
 * parsed, and Athena would still refuse to run it. That fails the query
 * whether or not the engine is strict, since falling back would leave a test
 * green on SQL the service rejects.
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
    return simAthenaTurnedDownSql(simAthenaUnparsedStatement);
  }

  const rejected = simAthenaRejectedStatement(ast);

  if (rejected !== undefined) {
    return simAthenaRejectedSql(rejected);
  }

  try {
    if (
      !simAthenaRewriteUnnest({
        ast,
        ordinality: read.ordinality,
        tables: request.tables,
      })
    ) {
      return simAthenaTurnedDownSql(simAthenaUnrewrittenUnnest);
    }

    simAthenaRewriteCasts(ast);

    // Read before the tree is written back out, since the rewrites above can
    // move a select item and the scale travels by position.
    const scales = simAthenaRoundScales(ast);

    return simAthenaTranslated(
      simAthenaSqlForSqlite(parser.sqlify(ast, { database: "sqlite" })),
      scales,
    );
  } catch {
    return simAthenaTurnedDownSql(simAthenaUnwrittenStatement);
  }
}
