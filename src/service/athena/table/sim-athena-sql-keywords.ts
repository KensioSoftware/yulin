/**
 * The words that never start a table name.
 *
 * A scanner reading what follows `FROM` uses this to tell a table name from a
 * query it has misread. The set is the keywords that can legally sit there in
 * a statement this simulation resolves, plus the ones that mark the end of the
 * clause.
 */
export const simAthenaClauseKeywords = new Set([
  "as",
  "cross",
  "full",
  "group",
  "having",
  "inner",
  "join",
  "lateral",
  "left",
  "limit",
  "natural",
  "offset",
  "on",
  "order",
  "outer",
  "right",
  "select",
  "union",
  "unnest",
  "using",
  "where",
  "window",
  "with",
]);

/**
 * The words a parenthesis may follow while still opening a subquery or a list.
 *
 * A parenthesis opening straight after any other word is a function call, and
 * `FROM` inside one belongs to the function. `EXTRACT(hour FROM ts)` and
 * `SUBSTRING(s FROM 2)` are the two that matter, and both would otherwise read
 * as a table called `ts` or `2`.
 */
export const simAthenaSubqueryOpeners = new Set([
  "and",
  "as",
  "exists",
  "from",
  "in",
  "join",
  "not",
  "on",
  "or",
  "select",
  "union",
  "values",
  "where",
  "with",
]);

/** The statement kinds this simulation resolves table names for. */
export const simAthenaResolvedStatements = new Set(["select", "with"]);

/**
 * The words that end a `FROM` clause.
 *
 * A comma before one of these separates two tables, and a comma after one
 * belongs to something else. `AS` is left out on purpose, since an alias sits
 * inside the clause it names a table in.
 */
export const simAthenaFromClauseEnders = new Set([
  "except",
  "group",
  "having",
  "intersect",
  "limit",
  "offset",
  "on",
  "order",
  "select",
  "union",
  "using",
  "where",
  "window",
]);
