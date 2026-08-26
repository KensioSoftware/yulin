/**
 * One column of a declared result.
 */
export interface SimAthenaDeclaredColumn {
  readonly name: string;

  /**
   * The Athena type the column reports. Defaults to `varchar`.
   */
  readonly type?: string | undefined;
}

/**
 * What a test says one query answers with.
 *
 * A declaration is matched on the query text, and the rows, the columns and
 * the bytes scanned are all a test's own statement about what the query did. A
 * declaration written against one exact query wins over the query engine, and
 * one written against a workgroup or the default answers whatever the engine
 * turned down.
 */
export interface SimAthenaDeclaredResult {
  /**
   * The columns the result set carries, in order. A bare string is a column
   * of that name and the default type.
   */
  readonly columns?: readonly (string | SimAthenaDeclaredColumn)[] | undefined;

  /**
   * The rows, each holding one value per column.
   */
  readonly rows?: readonly (readonly string[])[] | undefined;

  /**
   * How many bytes the query scanned.
   *
   * This is what a workgroup's `BytesScannedCutoffPerQuery` is measured
   * against, so it is how a test drives the cost guardrail.
   */
  readonly bytesScanned?: number | undefined;

  /**
   * Fail the query with this reason rather than answering it.
   *
   * A declared failure wins over the engine, whichever tier declared it. That
   * is what makes a client's failure handling reachable for a query the engine
   * would otherwise answer.
   */
  readonly failsWith?: string | undefined;
}
