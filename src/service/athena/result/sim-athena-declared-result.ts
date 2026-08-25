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
 * Nothing here is derived from the SQL. The simulation reads a query only as a
 * key to match a declaration on, so the rows, the columns and the bytes
 * scanned are all a test's own statement about what the query did.
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
   * Nothing here reads SQL, so a query that should fail cannot be discovered.
   * A test says so instead, which is what makes a client's failure handling
   * reachable.
   */
  readonly failsWith?: string | undefined;
}
