import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";
import type { SimAthenaTableReference } from "./sim-athena-table-reference.js";

/**
 * The names a `WITH` clause defines.
 *
 * A common table expression is written `name AS (`, and nothing else in a
 * statement this scanner reads puts a bracket straight after `AS`. Athena also
 * lets one name its output columns, as `name (a, b) AS (`, so the name is not
 * always the token before the `AS`.
 */
export function simAthenaCommonTableNames(
  tokens: readonly SimAthenaSqlToken[],
): ReadonlySet<string> {
  const names = new Set<string>();

  for (const [position, word] of tokens.entries()) {
    if (word.kind !== "word" || word.text !== "as") {
      continue;
    }

    const opening = tokens.at(position + 1);

    if (opening?.kind !== "symbol" || opening.text !== "(") {
      continue;
    }

    const name = nameBefore(tokens, position);

    if (name?.kind === "word" || name?.kind === "quoted") {
      names.add(name.text.toLowerCase());
    }
  }

  return names;
}

/**
 * The name a common table expression declares, reading back from its `AS`.
 *
 * A closing bracket there is the end of an output column list, and the name
 * sits in front of the bracket that opened it.
 */
function nameBefore(
  tokens: readonly SimAthenaSqlToken[],
  position: number,
): SimAthenaSqlToken | undefined {
  const previous = position === 0 ? undefined : tokens.at(position - 1);

  if (previous?.kind !== "symbol" || previous.text !== ")") {
    return previous;
  }

  const opening = openingBracket(tokens, position - 1);

  return opening === undefined || opening === 0
    ? undefined
    : tokens.at(opening - 1);
}

/** Where the bracket closing at this position was opened. */
function openingBracket(
  tokens: readonly SimAthenaSqlToken[],
  closedAt: number,
): number | undefined {
  let cursor = closedAt;
  let depth = 0;

  while (cursor >= 0) {
    const token = tokens.at(cursor);

    if (token?.kind === "symbol" && token.text === ")") {
      depth += 1;
    }

    if (token?.kind === "symbol" && token.text === "(") {
      depth -= 1;

      if (depth === 0) {
        return cursor;
      }
    }

    cursor -= 1;
  }

  return undefined;
}

/**
 * Whether this reference names one of them.
 *
 * A common table expression is never qualified, so a name carrying a database
 * or a catalog is a catalog entry whatever a `WITH` clause called something
 * else.
 */
export function simAthenaIsCommonTable(
  reference: SimAthenaTableReference,
  names: ReadonlySet<string>,
): boolean {
  return (
    reference.database === undefined &&
    reference.catalog === undefined &&
    names.has(reference.name.toLowerCase())
  );
}
