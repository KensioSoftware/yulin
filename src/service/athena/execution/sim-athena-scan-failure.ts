import { simAthenaScannedLocation } from "./sim-athena-scanned-location.js";

/**
 * Why a query could not read what it was about to scan.
 *
 * Athena reads a table's data under the identity that asked for it. A caller
 * without permission on the Bucket fails here rather than answering from an
 * empty listing. Naming the Buckets is what makes that reachable, since a
 * query may read several and only one of them refused.
 *
 * A Bucket that does not exist never reaches this. That one scans nothing and
 * the query carries on.
 */
export function simAthenaScanFailureReason(
  error: unknown,
  prefixes: readonly string[],
): string {
  const buckets = [
    ...new Set(
      prefixes
        .map((prefix) => simAthenaScannedLocation(prefix)?.bucket)
        .filter((bucket) => bucket !== undefined),
    ),
  ];
  const named = buckets.length === 0 ? "its data" : buckets.join(", ");
  const cause = error instanceof Error ? error.message : String(error);

  return `The query could not read ${named}. ${cause}`;
}
