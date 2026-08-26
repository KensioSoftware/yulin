import {
  simAthenaCommonTableNames,
  simAthenaIsCommonTable,
} from "./sim-athena-common-tables.js";
import {
  simAthenaFromClauseEnders,
  simAthenaResolvedStatements,
} from "./sim-athena-sql-keywords.js";
import { simAthenaReadReference } from "./sim-athena-table-name.js";
import {
  simAthenaIsSubqueryOpener,
  simAthenaIsTablePosition,
  simAthenaTokenBefore,
} from "./sim-athena-table-position.js";
import {
  simAthenaSqlTokens,
  type SimAthenaSqlToken,
} from "./sim-athena-sql-tokens.js";
import type { SimAthenaTableReference } from "./sim-athena-table-reference.js";

/**
 * What a query's table names came to.
 *
 * `readable` false is a query this scanner could not make sense of. Nothing is
 * resolved for one, since refusing a query real Athena would run costs more
 * than the check returns.
 */
export interface SimAthenaTableReferences {
  readonly readable: boolean;
  readonly references: readonly SimAthenaTableReference[];
}

const unreadable: SimAthenaTableReferences = {
  readable: false,
  references: [],
};

/**
 * The tables a query names, read out of the statement without planning it.
 *
 * Only `FROM` and `JOIN` positions are read, along with a comma separating two
 * tables in a FROM clause. A name defined by a `WITH` clause is left out,
 * because a common table expression is no catalog entry, and so is a subquery
 * and anything `UNNEST` produces.
 *
 * Everything about this is deliberately conservative. A statement it cannot
 * follow is reported as unreadable rather than guessed at, and a statement
 * that writes data is left alone entirely.
 */
export function simAthenaTableReferences(
  sql: string,
): SimAthenaTableReferences {
  const tokens = simAthenaSqlTokens(sql);

  if (tokens === undefined || tokens.length === 0) {
    return unreadable;
  }

  const first = tokens.at(0);

  if (first?.kind !== "word" || !simAthenaResolvedStatements.has(first.text)) {
    return unreadable;
  }

  return scan(tokens);
}

function scan(tokens: readonly SimAthenaSqlToken[]): SimAthenaTableReferences {
  const commonTableNames = simAthenaCommonTableNames(tokens);
  const references: SimAthenaTableReference[] = [];
  const openers: boolean[] = [];

  // The bracket depths currently inside a FROM clause. A comma separates two
  // tables only at a depth in here, which is what tells it apart from a comma
  // in a subquery's select list or in a function's arguments.
  const fromDepths = new Set<number>();

  for (const [position, token] of tokens.entries()) {
    if (token.kind === "symbol" && token.text === "(") {
      openers.push(
        simAthenaIsSubqueryOpener(simAthenaTokenBefore(tokens, position)),
      );
      continue;
    }

    if (token.kind === "symbol" && token.text === ")") {
      fromDepths.delete(openers.length);
      openers.pop();
      continue;
    }

    if (token.kind === "word" && simAthenaFromClauseEnders.has(token.text)) {
      fromDepths.delete(openers.length);
    }

    if (
      !simAthenaIsTablePosition(
        token,
        simAthenaTokenBefore(tokens, position),
        fromDepths,
        openers,
      )
    ) {
      continue;
    }

    if (token.kind === "word" && token.text === "from") {
      fromDepths.add(openers.length);
    }

    // Inside a function call, where `EXTRACT(hour FROM ts)` puts a `FROM`
    // that names no table.
    if (!(openers.at(-1) ?? true)) {
      continue;
    }

    const read = simAthenaReadReference(tokens, position + 1);

    if (read === undefined) {
      return unreadable;
    }

    if (
      read.reference !== undefined &&
      !simAthenaIsCommonTable(read.reference, commonTableNames)
    ) {
      references.push(read.reference);
    }
  }

  return { readable: true, references };
}
