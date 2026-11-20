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
  const alias = first?.text === "as" ? tokens.at(position + 1) : first;

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

/**
 * The name a column's qualifier gives, as in the `a` of `a.day`.
 *
 * A name qualified further (`db.t.day`) gives the part next to the column.
 */
export function simAthenaQualifierOf(
  tokens: readonly SimAthenaSqlToken[],
  position: number,
): string | undefined {
  const dot = tokens.at(position - 1);
  const qualifier = tokens.at(position - 2);

  if (
    position < 2 ||
    dot?.kind !== "symbol" ||
    dot.text !== "." ||
    (qualifier?.kind !== "word" && qualifier?.kind !== "quoted")
  ) {
    return undefined;
  }

  return simAthenaFoldedName(qualifier.text);
}
