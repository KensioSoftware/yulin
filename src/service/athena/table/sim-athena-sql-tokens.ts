import {
  simAthenaCommentEnd,
  simAthenaReadToken,
} from "./sim-athena-sql-token-readers.js";

/**
 * One token of a query, as much of one as finding table names needs.
 *
 * A word carries its text lowercased, because Athena folds an unquoted
 * identifier to lower case and a keyword is matched however it was written. A
 * quoted identifier keeps the case it was given, which is what quoting it
 * means.
 */
export interface SimAthenaSqlToken {
  readonly kind: "word" | "quoted" | "symbol" | "literal";
  readonly text: string;
  readonly index: number;
}

/**
 * Read a query into tokens, or report that it cannot be read.
 *
 * Nothing here parses. The tokens exist so that a scanner can find what sits
 * after `FROM` and `JOIN` without being confused by a keyword inside a string
 * literal or a comment.
 *
 * An unterminated string, comment or quoted identifier answers `undefined`.
 * That is a query this simulation has no opinion about, and a caller treats it
 * as one to leave alone.
 */
export function simAthenaSqlTokens(
  sql: string,
): readonly SimAthenaSqlToken[] | undefined {
  const tokens: SimAthenaSqlToken[] = [];
  let index = 0;

  while (index < sql.length) {
    if (/\s/.test(sql.charAt(index))) {
      index += 1;
      continue;
    }

    const commentEnd = simAthenaCommentEnd(sql, index);

    if (commentEnd === -1) {
      return undefined;
    }

    if (commentEnd !== undefined) {
      index = commentEnd;
      continue;
    }

    const read = simAthenaReadToken(sql, index);

    if (read === undefined) {
      return undefined;
    }

    tokens.push(read.token);
    index = read.next;
  }

  return tokens;
}

/**
 * Where one token sits in the query, as Athena counts it.
 *
 * Athena reports a position with its errors and counts both from one, so an
 * identifier at the very start of a query is at line 1 column 1.
 */
export function simAthenaSqlPosition(
  sql: string,
  index: number,
): { line: number; column: number } {
  const lines = sql.slice(0, index).split("\n");

  return {
    line: lines.length,
    column: (lines.at(-1) ?? "").length + 1,
  };
}
