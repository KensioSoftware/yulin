import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { simAthenaListedObjects } from "./sim-athena-listed-objects.js";
import type { SimAthenaScannedObjects } from "./sim-athena-scanned-objects.js";

interface SimAthenaScannedBytesRequest {
  readonly prefixes: readonly string[];
  readonly s3: SimAthenaScannedObjects;
  readonly caller: SimAwsCaller | undefined;
}

/**
 * How many bytes a query scans, measured from the objects it reads.
 *
 * Every object under every prefix counts, in full. Real Athena reads only the
 * columns a query asks for and counts the compressed bytes, so this reports
 * more than AWS would for the same data in a columnar format. The Athena docs
 * page says so.
 *
 * A key reached through two prefixes is counted once, and a prefix whose
 * Bucket does not exist scans nothing. Both belong to the listing.
 */
export async function simAthenaScannedBytes(
  request: SimAthenaScannedBytesRequest,
): Promise<number> {
  const objects = await simAthenaListedObjects(
    { s3: request.s3, caller: request.caller },
    request.prefixes,
  );

  return objects.reduce((bytes, object) => bytes + object.size, 0);
}
