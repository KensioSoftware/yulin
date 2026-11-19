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

/**
 * The clauses a subquery may open in and still narrow what is read.
 *
 * The empty clause is the statement before its first keyword, where a
 * bracketed query starts a `UNION`.
 */
const narrowingContexts = new Set([
  "",
  "except",
  "from",
  "intersect",
  "join",
  "on",
  "union",
  "where",
  "with",
]);

/** One bracket group, and whether anything inside it can narrow. */
interface SimAthenaBracketGroup {
  clause: string;
  readonly excluded: boolean;
}

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
 * function call. Nothing inside a function call counts, a subquery included,
 * and neither does anything inside a bracket opened in the select list or in
 * a clause after `GROUP BY`. A subquery's `WHERE` there would otherwise narrow
 * every read of its table, the outer query's own included. The `WHERE` of an
 * aggregate's `FILTER` clause chooses the rows that one aggregate sees, and
 * leaves the scan alone.
 *
 * Nothing here parses. A term it fails to count leaves its column unfiltered,
 * which is the answer a query with no filter gets.
 */
export function simAthenaFilteringPositions(
  tokens: readonly SimAthenaSqlToken[],
): ReadonlySet<number> {
  const groups: SimAthenaBracketGroup[] = [{ clause: "", excluded: false }];
  const positions = new Set<number>();
  let caseDepth = 0;

  for (const [position, token] of tokens.entries()) {
    const group = groups.at(-1) ?? { clause: "", excluded: true };

    if (token.kind === "symbol" && token.text === "(") {
      groups.push(openedGroup(tokens.at(position - 1), group));
    } else if (token.kind === "symbol" && token.text === ")") {
      groups.length = Math.max(1, groups.length - 1);
    } else if (token.kind === "word") {
      caseDepth = Math.max(0, caseDepth + caseStep(token.text));
      startClause(group, token.text, tokens.at(position - 1));
    }

    if (
      caseDepth === 0 &&
      !group.excluded &&
      filteringClauses.has(group.clause)
    ) {
      positions.add(position);
    }
  }

  return positions;
}

/** The group a bracket opens, read from the token before it. */
function openedGroup(
  before: SimAthenaSqlToken | undefined,
  around: SimAthenaBracketGroup,
): SimAthenaBracketGroup {
  const excluded = around.excluded || !narrowingContexts.has(around.clause);

  if (before === undefined || before.kind === "symbol") {
    return { clause: around.clause, excluded };
  }

  if (before.kind === "word" && simAthenaSubqueryOpeners.has(before.text)) {
    return { clause: around.clause, excluded };
  }

  return { clause: around.clause, excluded: true };
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
 * The `FROM` of `IS DISTINCT FROM` is part of a comparison, and leaves the
 * clause it sits in going.
 */
function startClause(
  group: SimAthenaBracketGroup,
  word: string,
  before: SimAthenaSqlToken | undefined,
): void {
  if (!clauseStarters.has(word)) {
    return;
  }

  if (
    word === "from" &&
    before?.kind === "word" &&
    before.text === "distinct"
  ) {
    return;
  }

  group.clause = word;
}
