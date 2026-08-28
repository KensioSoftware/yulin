/** The name the rewrite calls, which the aggregate shims register. */
export const countDistinctShim = "count_distinct";

/** Where one `count(DISTINCT` opens, however the statement spaced it. */
const opening = /\bcount\s*\(\s*DISTINCT\b/giu;

/** One name in a column reference, quoted or bare. */
const namePart = /^(?:"[^"]*"|[A-Za-z_]\w*)$/u;

/**
 * `count(DISTINCT <expression>)`, written as a call the parser will take.
 *
 * The parser's Athena grammar takes a column after `DISTINCT` and nothing else,
 * so `count(DISTINCT concat(a, b))` is refused outright and the whole query
 * falls back. SQLite takes the same expression happily, and so does Athena, so
 * the gap is the grammar rather than the engine.
 *
 * A plain column is left alone, since that already parses and SQLite counts it
 * natively. Everything else becomes a call to one aggregate of the simulator's
 * own, which counts the distinct values the same way.
 */
export function simAthenaCountDistinct(sql: string): string {
  const quoted = quotedPositions(sql);
  let rewritten = "";
  let read = 0;

  opening.lastIndex = 0;

  for (
    let match = opening.exec(sql);
    match !== null;
    match = opening.exec(sql)
  ) {
    const closes = closingParenthesis(sql, opening.lastIndex, quoted);

    if (closes === undefined || quoted.at(match.index) === true) {
      continue;
    }

    const argument = sql.slice(opening.lastIndex, closes).trim();

    if (isColumnReference(argument)) {
      continue;
    }

    rewritten += `${sql.slice(read, match.index)}${countDistinctShim}(${argument})`;
    read = closes + 1;
    opening.lastIndex = read;
  }

  return rewritten + sql.slice(read);
}

/**
 * Whether this argument is a column the grammar would have taken as it stands.
 *
 * A quoted name carrying a dot of its own reads here as two names and fails
 * this. The call is then rewritten, and the rewrite answers the same way.
 */
function isColumnReference(argument: string): boolean {
  return argument.split(".").every((part) => namePart.test(part.trim()));
}

/**
 * Whether the character at each position sits inside quotes.
 *
 * Both of SQL's quotes are tracked. A single quote opens a string literal and a
 * double quote opens a delimited identifier, and either is free to carry the
 * text of a call. Rewriting inside a literal would change the value a
 * comparison is made against, and rewriting inside an identifier would name a
 * different column.
 *
 * SQL escapes a quote inside either by doubling it, which reads here as one
 * quoted run ending and another starting. The positions in between land the
 * same way whichever reading is taken.
 */
function quotedPositions(sql: string): readonly boolean[] {
  const inside: boolean[] = [];
  let quote: string | undefined;

  for (const character of quotableCharacters(sql)) {
    if (quote === undefined && (character === "'" || character === '"')) {
      quote = character;
    } else if (quote === character) {
      quote = undefined;
    }

    inside.push(quote !== undefined);
  }

  return inside;
}

/** Each character of the statement, by position rather than by code point. */
function* quotableCharacters(sql: string): Generator<string> {
  for (let at = 0; at < sql.length; at += 1) {
    yield sql.charAt(at);
  }
}

/**
 * Where the parenthesis that opened this call closes, or nothing where the
 * statement never closes it.
 *
 * Depth is counted so that a call carrying calls of its own is read whole, and
 * a parenthesis inside quotes is passed over so that it is not counted.
 */
function closingParenthesis(
  sql: string,
  from: number,
  quoted: readonly boolean[],
): number | undefined {
  let depth = 0;

  for (let at = from; at < sql.length; at += 1) {
    const character = quoted.at(at) === true ? "" : sql.charAt(at);

    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      if (depth === 0) {
        return at;
      }

      depth -= 1;
    }
  }

  return undefined;
}
