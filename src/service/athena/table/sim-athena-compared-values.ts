import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";

/** The literal values `column = 'value'` or `column IN (...)` compares to. */
export function simAthenaComparedValues(
  tokens: readonly SimAthenaSqlToken[],
  position: number,
): readonly string[] | undefined {
  const operator = tokens.at(position + 1);

  if (operator?.kind === "symbol" && operator.text === "=") {
    const value = tokens.at(position + 2);

    return value?.kind === "literal" ? [value.text] : undefined;
  }

  if (operator?.kind !== "word" || operator.text !== "in") {
    return undefined;
  }

  return literalList(tokens, position + 2);
}

/**
 * Read `('a', 'b')` starting at its opening bracket.
 *
 * Anything else in the brackets, such as a subquery, answers with nothing and
 * leaves the column unfiltered.
 */
function literalList(
  tokens: readonly SimAthenaSqlToken[],
  start: number,
): readonly string[] | undefined {
  if (tokens.at(start)?.text !== "(") {
    return undefined;
  }

  const values: string[] = [];
  let cursor = start + 1;

  while (cursor < tokens.length) {
    const value = tokens.at(cursor);

    if (value?.kind !== "literal") {
      return undefined;
    }

    values.push(value.text);
    cursor += 1;

    const separator = tokens.at(cursor);

    if (separator?.text === ")") {
      return values;
    }

    if (separator?.text !== ",") {
      return undefined;
    }

    cursor += 1;
  }

  return undefined;
}
