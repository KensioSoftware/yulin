import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";
import type { SimAthenaTableReference } from "./sim-athena-table-reference.js";

/**
 * The names a `WITH` clause defines.
 *
 * A common table expression is written `name AS (`, and nothing else in a
 * statement this scanner reads puts a bracket straight after `AS`.
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

    const name = position === 0 ? undefined : tokens.at(position - 1);

    if (name?.kind === "word" || name?.kind === "quoted") {
      names.add(name.text.toLowerCase());
    }
  }

  return names;
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
