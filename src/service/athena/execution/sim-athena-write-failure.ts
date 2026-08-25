/**
 * Why a query that answered rows still failed.
 *
 * Real Athena fails a query it cannot write the results of, and says so on the
 * execution rather than raising at a caller who has already been answered and
 * has gone away to poll.
 */
export function simAthenaWriteFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return `Query results could not be written to the output location: ${message}`;
}
