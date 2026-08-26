import { simAthenaSubqueryOpeners } from "./sim-athena-sql-keywords.js";
import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";

/**
 * The token before this one, where there is one.
 *
 * `Array.prototype.at` would answer with the last token for position zero,
 * which is why this guards rather than calling it directly.
 */
export function simAthenaTokenBefore(
  tokens: readonly SimAthenaSqlToken[],
  position: number,
): SimAthenaSqlToken | undefined {
  return position === 0 ? undefined : tokens.at(position - 1);
}

/**
 * Whether a table name may follow this token.
 *
 * `FROM` and `JOIN` open one. So does a comma inside a FROM clause, which is
 * how `FROM orders, customers` names two tables.
 */
export function simAthenaIsTablePosition(
  token: SimAthenaSqlToken,
  previous: SimAthenaSqlToken | undefined,
  fromDepths: ReadonlySet<number>,
  openers: readonly boolean[],
): boolean {
  if (token.kind === "symbol") {
    return token.text === "," && fromDepths.has(openers.length);
  }

  return token.kind === "word" && isTableClause(token, previous);
}

/** Whether this word opens a table position rather than sitting inside one. */
function isTableClause(
  token: SimAthenaSqlToken,
  previous: SimAthenaSqlToken | undefined,
): boolean {
  if (token.text !== "from" && token.text !== "join") {
    return false;
  }

  // A qualified name never has a clause keyword as one of its parts, so a
  // `from` straight after a dot is a column called from.
  return !(previous?.kind === "symbol" && previous.text === ".");
}

/**
 * Whether a bracket opening after this token holds a subquery or a list.
 *
 * A bracket opening straight after any other word is a function call, and a
 * `FROM` inside one belongs to the function. `EXTRACT(hour FROM ts)` and
 * `SUBSTRING(s FROM 2)` are the two that matter, and both would otherwise name
 * a table.
 */
export function simAthenaIsSubqueryOpener(
  previous: SimAthenaSqlToken | undefined,
): boolean {
  if (previous === undefined) {
    return true;
  }

  if (previous.kind === "word") {
    return simAthenaSubqueryOpeners.has(previous.text);
  }

  return previous.kind !== "quoted";
}
