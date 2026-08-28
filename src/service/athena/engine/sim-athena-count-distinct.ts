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
  let rewritten = "";
  let read = 0;

  opening.lastIndex = 0;

  for (
    let match = opening.exec(sql);
    match !== null;
    match = opening.exec(sql)
  ) {
    const closes = closingParenthesis(sql, opening.lastIndex);

    if (closes === undefined || isQuoted(sql, match.index)) {
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
 * Whether this position sits inside a string literal.
 *
 * A literal is free to carry the text of a call, and rewriting inside one would
 * quietly change the value a comparison is made against. SQL escapes a quote
 * inside a literal by doubling it, which counts here as one literal ending and
 * another starting, so the count stays even either way.
 */
function isQuoted(sql: string, at: number): boolean {
  let quotes = 0;

  for (let read = 0; read < at; read += 1) {
    if (sql.at(read) === "'") {
      quotes += 1;
    }
  }

  return quotes % 2 === 1;
}

/**
 * Where the parenthesis that opened this call closes, or nothing where the
 * statement never closes it.
 *
 * Depth is counted so that a call carrying calls of its own is read whole, and
 * a string literal is skipped so that a parenthesis inside one is not counted.
 * SQL escapes a quote inside a literal by doubling it, which reads here as one
 * literal ending and another starting.
 */
function closingParenthesis(sql: string, from: number): number | undefined {
  let depth = 0;
  let quoted = false;

  for (let at = from; at < sql.length; at += 1) {
    const character = sql.at(at);

    if (character === "'") {
      quoted = !quoted;
    } else if (!quoted && character === "(") {
      depth += 1;
    } else if (!quoted && character === ")") {
      if (depth === 0) {
        return at;
      }

      depth -= 1;
    }
  }

  return undefined;
}
