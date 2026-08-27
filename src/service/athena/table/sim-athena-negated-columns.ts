import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";

/**
 * The columns a `NOT` in this query could have negated.
 *
 * A negated value names the partition a query does not want, so a column under
 * a `NOT` is left unconstrained. A query filtering bots out of a day's logs
 * negates nothing about the day, and reading how far each `NOT` reaches is
 * what tells the two apart.
 */
export function simAthenaNegatedColumns(
  tokens: readonly SimAthenaSqlToken[],
): ReadonlySet<string> {
  const negated = new Set<string>();

  for (const [position, token] of tokens.entries()) {
    if (token.kind === "word" && token.text === "not") {
      for (const name of namesUnder(tokens, position)) {
        negated.add(name.toLowerCase());
      }
    }
  }

  return negated;
}

/** The words a `NOT` reaches no further than, `OR` aside. */
const boundary = new Set([
  "and",
  "except",
  "from",
  "group",
  "having",
  "intersect",
  "limit",
  "offset",
  "order",
  "union",
  "where",
  "window",
]);

/**
 * The identifiers one `NOT` reaches.
 *
 * `NOT` binds tighter than `AND`, so its reach ends at the next of the words
 * above, outside any brackets, and at the bracket the `NOT` itself sits in.
 * `OR` is absent from that list because a query carrying one is left
 * unfiltered before this runs.
 *
 * Nothing here parses, so a name a `NOT` could not really have reached is
 * dropped anyway. That direction only ever leaves a column unfiltered, which
 * is the answer a query with no filter gets.
 */
function namesUnder(
  tokens: readonly SimAthenaSqlToken[],
  position: number,
): readonly string[] {
  const names: string[] = [];
  let depth = 0;
  let cursor = position + 1;

  while (cursor < tokens.length) {
    const token = tokens.at(cursor);

    if (token?.kind === "symbol" && token.text === "(") {
      depth += 1;
    } else if (token?.kind === "symbol" && token.text === ")") {
      if (depth === 0) {
        return names;
      }

      depth -= 1;
    } else if (
      depth === 0 &&
      token?.kind === "word" &&
      boundary.has(token.text)
    ) {
      return names;
    } else if (token?.kind === "word" || token?.kind === "quoted") {
      names.push(token.text);
    }

    cursor += 1;
  }

  return names;
}
