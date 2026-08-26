import { simAthenaClauseKeywords } from "./sim-athena-sql-keywords.js";
import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";
import type { SimAthenaTableReference } from "./sim-athena-table-reference.js";

/** What a table position came to, once it has been read. */
export interface SimAthenaReferenceRead {
  readonly reference: SimAthenaTableReference | undefined;
}

/**
 * Read what follows a `FROM` or a `JOIN`.
 *
 * A parenthesis is a subquery and `UNNEST` produces rows of its own, so both
 * answer with no reference. Anything the scanner cannot follow answers
 * `undefined`, which fails the whole read.
 */
export function simAthenaReadReference(
  tokens: readonly SimAthenaSqlToken[],
  start: number,
): SimAthenaReferenceRead | undefined {
  const leading = tokens.at(start);

  if (leading === undefined || leading.kind === "literal") {
    return undefined;
  }

  if (leading.kind === "symbol") {
    return leading.text === "(" ? { reference: undefined } : undefined;
  }

  if (leading.kind === "word" && simAthenaClauseKeywords.has(leading.text)) {
    return leading.text === "unnest" || leading.text === "lateral"
      ? { reference: undefined }
      : undefined;
  }

  return { reference: qualifiedName(tokens, start) };
}

/**
 * Read a name of one, two or three parts.
 *
 * Athena qualifies a table as `catalog.database.table`, and a query naming
 * fewer parts leaves the outer ones to the request.
 */
function qualifiedName(
  tokens: readonly SimAthenaSqlToken[],
  start: number,
): SimAthenaTableReference | undefined {
  const parts = nameParts(tokens, start);
  const name = parts?.at(-1);

  if (parts === undefined || name === undefined) {
    return undefined;
  }

  return {
    catalog: parts.length === 3 ? parts.at(0) : undefined,
    database: parts.length >= 2 ? parts.at(-2) : undefined,
    name,
    index: tokens.at(start)?.index ?? 0,
  };
}

/** The dot-separated parts of one name, or nothing where it is not a name. */
function nameParts(
  tokens: readonly SimAthenaSqlToken[],
  start: number,
): readonly string[] | undefined {
  const parts: string[] = [];
  let cursor = start;

  while (parts.length < 3) {
    const part = tokens.at(cursor);

    if (part?.kind !== "word" && part?.kind !== "quoted") {
      return undefined;
    }

    parts.push(part.text);
    cursor += 1;

    const separator = tokens.at(cursor);

    if (separator?.kind !== "symbol" || separator.text !== ".") {
      break;
    }

    cursor += 1;
  }

  return parts;
}
