/** What a statement asks for, once the parser's grammar has been worked around. */
export interface SimAthenaParserSql {
  readonly sql: string;

  /** Whether an `UNNEST` asked for the position of each element. */
  readonly ordinality: boolean;
}

/**
 * `WITH ORDINALITY`, which the parser's Athena grammar refuses outright.
 *
 * Nothing else in Trino spells it, so taking it out of the statement and
 * remembering that it was there is enough to get the rest of the `UNNEST`
 * through the grammar.
 */
const withOrdinality = /\s+WITH\s+ORDINALITY\b/giu;

/**
 * The statement as the parser's Athena grammar will take it.
 *
 * The two rewrites close a gap in that grammar rather than a gap in SQLite.
 * `try_cast` becomes a plain cast, which changes meaning in the forgiving
 * direction, since SQLite already answers with a value where a cast fails
 * rather than failing the query. Trino writes `OFFSET` before `LIMIT` and every
 * other dialect writes it after.
 */
export function simAthenaSqlForParser(sql: string): SimAthenaParserSql {
  const rewritten = sql
    .replaceAll(/\btry_cast\s*\(/giu, "CAST(")
    .replaceAll(
      /\bOFFSET\s+(\d+)\s+LIMIT\s+(\d+)/giu,
      (_match, offset: string, limit: string) =>
        `LIMIT ${limit} OFFSET ${offset}`,
    );

  const forParser = rewritten.replaceAll(withOrdinality, "");

  return {
    sql: forParser,
    ordinality: forParser.length !== rewritten.length,
  };
}

/**
 * An ascending sort, and what can follow the item it sorts once the parser has
 * written the statement back out.
 *
 * A window's own `ORDER BY` is followed by its frame, so `ROWS`, `RANGE` and
 * `GROUPS` belong here alongside the ones that end a statement's.
 */
const ascendingSort =
  /\bASC\b(?=\s*(?:,|\)|$|LIMIT\b|OFFSET\b|UNION\b|EXCEPT\b|INTERSECT\b|ROWS\b|RANGE\b|GROUPS\b))/gu;

/**
 * The statement as SQLite will take it.
 *
 * `ASC NULLS LAST` is the one that matters. Trino orders nulls last whichever
 * direction it sorts, and SQLite orders them first ascending, so a query with
 * a nullable sort column answers in a different order under each. Descending
 * already agrees. The parser writes `ASC` out explicitly even where the
 * statement left the direction off, so every ascending sort is reached here.
 *
 * A typed `DATE` or `TIMESTAMP` literal becomes the bare string it wraps,
 * which is how the value was stored.
 */
export function simAthenaSqlForSqlite(sql: string): string {
  return sql
    .replaceAll(ascendingSort, "ASC NULLS LAST")
    .replaceAll(/\b(?:DATE|TIMESTAMP)\s+'([^']*)'/giu, "'$1'");
}
