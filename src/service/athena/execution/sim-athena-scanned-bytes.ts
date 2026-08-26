import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import {
  simAthenaScannedLocation,
  type SimAthenaScannedLocation,
} from "./sim-athena-scanned-location.js";
import { simAthenaScannedPage } from "./sim-athena-scanned-page.js";

/**
 * The narrow slice of simulated S3 that measuring a query needs.
 *
 * `SimS3` structurally implements this, the way it implements
 * `SimAthenaResultDestination`.
 */
export interface SimAthenaScannedObjects {
  listObjectsV2(
    command: {
      input: {
        Bucket: string;
        Prefix: string;
        ContinuationToken?: string | undefined;
      };
    },
    options?: { caller: SimAwsCaller },
  ): Promise<{
    Contents?: readonly { Key?: string; Size?: number }[] | undefined;
    IsTruncated?: boolean | undefined;
    NextContinuationToken?: string | undefined;
  }>;
}

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
 * A key reached through two prefixes is counted once. Two projected partitions
 * never overlap, and a table location sitting above one of them can.
 *
 * A prefix whose Bucket does not exist scans nothing. A table pointing at a
 * Bucket the simulation never made is one nobody set data up for, and refusing
 * the query would fail every test written before anything was measured.
 */
export async function simAthenaScannedBytes(
  request: SimAthenaScannedBytesRequest,
): Promise<number> {
  const locations = request.prefixes
    .map((uri) => simAthenaScannedLocation(uri))
    .filter((location) => location !== undefined);

  const listed = await Promise.all(
    locations.map(async (location) => objectsUnder(request, location)),
  );

  return distinctBytes(listed.flat());
}

/** One listed object, keyed so that two Buckets never collide. */
interface SimAthenaScannedObject {
  readonly key: string;
  readonly size: number;
}

/**
 * What every object under one prefix comes to, counting each key once.
 */
function distinctBytes(objects: readonly SimAthenaScannedObject[]): number {
  const counted = new Set<string>();
  let bytes = 0;

  for (const object of objects) {
    if (counted.has(object.key)) {
      continue;
    }

    counted.add(object.key);
    bytes += object.size;
  }

  return bytes;
}

/**
 * Every object under one prefix, page by page.
 *
 * Written as a recursion because each page needs the token the one before it
 * answered with, which no parallel form can give.
 */
async function objectsUnder(
  request: SimAthenaScannedBytesRequest,
  location: SimAthenaScannedLocation,
  continuationToken?: string,
): Promise<readonly SimAthenaScannedObject[]> {
  const options =
    request.caller === undefined ? undefined : { caller: request.caller };
  const listed = await simAthenaScannedPage(
    request.s3,
    location,
    continuationToken,
    options,
  );

  if (listed === undefined) {
    return [];
  }

  const contents = listed.Contents ?? [];
  const objects = contents.map((object) => ({
    key: `${location.bucket}/${object.Key ?? ""}`,
    size: object.Size ?? 0,
  }));

  if (
    listed.IsTruncated !== true ||
    listed.NextContinuationToken === undefined
  ) {
    return objects;
  }

  const rest = await objectsUnder(
    request,
    location,
    listed.NextContinuationToken,
  );

  return [...objects, ...rest];
}
