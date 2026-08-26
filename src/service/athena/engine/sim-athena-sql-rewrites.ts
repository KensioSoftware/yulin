/**
 * The statement as the parser's Athena grammar will take it.
 *
 * Both rewrites close a gap in that grammar rather than a gap in SQLite.
 * `try_cast` becomes a plain cast, which changes meaning in the forgiving
 * direction, since SQLite already answers with a value where a cast fails
 * rather than failing the query. Trino writes `OFFSET` before `LIMIT` and
 * every other dialect writes it after.
 */
export function simAthenaSqlForParser(sql: string): string {
  return sql
    .replaceAll(/\btry_cast\s*\(/giu, "CAST(")
    .replaceAll(
      /\bOFFSET\s+(\d+)\s+LIMIT\s+(\d+)/giu,
      (_match, offset: string, limit: string) =>
        `LIMIT ${limit} OFFSET ${offset}`,
    );
}

/**
 * An ascending sort, and what can follow the item it sorts once the parser has
 * written the statement back out.
 */
const ascendingSort =
  /\bASC\b(?=\s*(?:,|\)|$|LIMIT\b|OFFSET\b|UNION\b|EXCEPT\b|INTERSECT\b))/gu;

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
