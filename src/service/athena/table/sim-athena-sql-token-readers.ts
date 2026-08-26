import type { SimAthenaSqlToken } from "./sim-athena-sql-tokens.js";

/** Characters an unquoted identifier or a keyword is made of. */
const wordCharacter = /[A-Za-z0-9_$]/;

/** The quote characters Athena accepts around an identifier. */
const identifierQuotes = new Set(['"', "`"]);

/** One token, with where reading carries on from. */
export interface SimAthenaSqlTokenRead {
  readonly token: SimAthenaSqlToken;
  readonly next: number;
}

/**
 * Where a comment starting here ends, or `undefined` where none starts.
 *
 * An unterminated block comment answers -1, which a caller reads as a query it
 * cannot make sense of.
 */
export function simAthenaCommentEnd(
  sql: string,
  index: number,
): number | undefined {
  if (sql.startsWith("--", index)) {
    const newline = sql.indexOf("\n", index);

    return newline === -1 ? sql.length : newline + 1;
  }

  if (!sql.startsWith("/*", index)) {
    return undefined;
  }

  const close = sql.indexOf("*/", index + 2);

  return close === -1 ? -1 : close + 2;
}

/** Read the one token starting here. */
export function simAthenaReadToken(
  sql: string,
  index: number,
): SimAthenaSqlTokenRead | undefined {
  const character = sql.charAt(index);

  if (character === "'") {
    return readDelimited(sql, index, "'", "literal");
  }

  if (identifierQuotes.has(character)) {
    return readDelimited(sql, index, character, "quoted");
  }

  if (wordCharacter.test(character)) {
    return readWord(sql, index);
  }

  return {
    token: { kind: "symbol", text: character, index },
    next: index + 1,
  };
}

/**
 * Read a string literal or a quoted identifier.
 *
 * A doubled quote inside one is an escaped quote, which is how both Athena and
 * ANSI SQL write it.
 */
function readDelimited(
  sql: string,
  index: number,
  quote: string,
  kind: "literal" | "quoted",
): SimAthenaSqlTokenRead | undefined {
  let cursor = index + 1;
  let text = "";

  while (cursor < sql.length) {
    const character = sql.charAt(cursor);

    if (character !== quote) {
      text += character;
      cursor += 1;
      continue;
    }

    if (sql.charAt(cursor + 1) === quote) {
      text += quote;
      cursor += 2;
      continue;
    }

    return { token: { kind, text, index }, next: cursor + 1 };
  }

  return undefined;
}

/**
 * Read a keyword or an unquoted identifier.
 *
 * The text is lowercased, because Athena folds an unquoted identifier down and
 * a keyword is matched however it was written.
 */
function readWord(sql: string, index: number): SimAthenaSqlTokenRead {
  let cursor = index;

  while (cursor < sql.length && wordCharacter.test(sql.charAt(cursor))) {
    cursor += 1;
  }

  return {
    token: {
      kind: "word",
      text: sql.slice(index, cursor).toLowerCase(),
      index,
    },
    next: cursor,
  };
}
