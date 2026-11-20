import {
  simAthenaClauseKeywords,
  simAthenaFromClauseEnders,
} from "./sim-athena-sql-keywords.js";
import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";
import { simAthenaFoldedName } from "./sim-athena-table-reference.js";

/**
 * The alias a table or a subquery in `FROM` takes, read from the token after
 * its name or its closing bracket.
 *
 * `AS` is optional, as Athena allows `FROM t a` and `FROM t AS a` alike. A
 * keyword in that place starts the next clause and names no alias.
 */
export function simAthenaAliasAt(
  tokens: readonly SimAthenaSqlToken[],
  position: number,
): string | undefined {
  const first = tokens.at(position);
  const keyword = first?.kind === "word" && first.text === "as";
  const alias = keyword ? tokens.at(position + 1) : first;

  if (alias?.kind === "quoted") {
    return simAthenaFoldedName(alias.text);
  }

  if (
    alias?.kind !== "word" ||
    simAthenaClauseKeywords.has(alias.text) ||
    simAthenaFromClauseEnders.has(alias.text)
  ) {
    return undefined;
  }

  return alias.text;
}

/** The name a column's qualifier gives, and the database it names. */
export interface SimAthenaQualifier {
  readonly name: string;
  readonly database: string | undefined;
}

/**
 * The qualifier of a column, as in the `a` of `a.day`.
 *
 * A name qualified further (`db.t.day`) gives the table next to the column
 * and the database before it.
 */
export function simAthenaQualifierOf(
  tokens: readonly SimAthenaSqlToken[],
  position: number,
): SimAthenaQualifier | undefined {
  const name = partBefore(tokens, position);

  if (name === undefined) {
    return undefined;
  }

  return { name, database: partBefore(tokens, position - 2) };
}

/** The name part before the dot ahead of this position, where there is one. */
function partBefore(
  tokens: readonly SimAthenaSqlToken[],
  position: number,
): string | undefined {
  const dot = tokens.at(position - 1);
  const part = tokens.at(position - 2);

  if (
    position < 2 ||
    dot?.kind !== "symbol" ||
    dot.text !== "." ||
    (part?.kind !== "word" && part?.kind !== "quoted")
  ) {
    return undefined;
  }

  return simAthenaFoldedName(part.text);
}
