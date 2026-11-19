import { simAthenaSubqueryOpeners } from "./sim-athena-sql-keywords.js";
import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";

/** The clauses whose terms decide which rows a query reads. */
const filteringClauses = new Set(["where", "on"]);

/** The words that start a clause, and so end the one before them. */
const clauseStarters = new Set([
  "except",
  "from",
  "group",
  "having",
  "intersect",
  "join",
  "limit",
  "offset",
  "on",
  "order",
  "select",
  "union",
  "using",
  "values",
  "where",
  "window",
  "with",
]);

/** What a bracket group opened by a function call is read as. */
const functionArguments = "arguments";

/** The words that start a query inside a function's arguments. */
const queryStarters = new Set(["select", "values", "with"]);

/**
 * The positions of every token that could constrain the rows a query reads.
 *
 * A token counts where it sits in a `WHERE` or an `ON` clause, outside every
 * `CASE` and outside every function's arguments. A comparison in the select
 * list picks a value out of each row, and so does one in a `CASE` condition
 * or in `if(day = 'x', ...)`. None of them leaves a row out.
 *
 * A bracket opened after a symbol, or after a word that opens a subquery or a
 * list, carries on the clause around it. One opened after any other word is a
 * function call, and nothing inside it filters until a subquery inside it
 * starts a `WHERE` of its own. The `WHERE` of an aggregate's `FILTER` clause
 * chooses the rows that one aggregate sees, and leaves the scan alone.
 *
 * Nothing here parses. A term it fails to count leaves its column unfiltered,
 * which is the answer a query with no filter gets.
 */
export function simAthenaFilteringPositions(
  tokens: readonly SimAthenaSqlToken[],
): ReadonlySet<number> {
  const clauses: string[] = [""];
  const positions = new Set<number>();
  let caseDepth = 0;

  for (const [position, token] of tokens.entries()) {
    if (token.kind === "symbol" && token.text === "(") {
      clauses.push(groupClause(tokens.at(position - 1), clauses.at(-1) ?? ""));
    } else if (token.kind === "symbol" && token.text === ")") {
      clauses.length = Math.max(1, clauses.length - 1);
    } else if (token.kind === "word") {
      caseDepth = Math.max(0, caseDepth + caseStep(token.text));
      startClause(clauses, token.text);
    }

    if (caseDepth === 0 && filteringClauses.has(clauses.at(-1) ?? "")) {
      positions.add(position);
    }
  }

  return positions;
}

/** The clause a bracket group opens in, read from the token before it. */
function groupClause(
  before: SimAthenaSqlToken | undefined,
  around: string,
): string {
  if (before === undefined || before.kind === "symbol") {
    return around;
  }

  if (before.kind === "word" && simAthenaSubqueryOpeners.has(before.text)) {
    return around;
  }

  return functionArguments;
}

/** How far one word moves into or out of a `CASE`. */
function caseStep(word: string): number {
  if (word === "case") {
    return 1;
  }

  return word === "end" ? -1 : 0;
}

/**
 * Record the clause a keyword starts in the innermost bracket group.
 *
 * Inside a function's arguments only a query starts a clause.
 */
function startClause(clauses: string[], word: string): void {
  if (!clauseStarters.has(word)) {
    return;
  }

  if (clauses.at(-1) === functionArguments && !queryStarters.has(word)) {
    return;
  }

  clauses[clauses.length - 1] = word;
}
