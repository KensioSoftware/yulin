import type {
  SimAthenaListedObject,
  SimAthenaListingRequest,
} from "./sim-athena-scanned-objects.js";
import { simAthenaScannedLocation } from "./sim-athena-scanned-location.js";
import { simAthenaObjectPages } from "./sim-athena-object-pages.js";

/**
 * Every object under one `s3://` prefix.
 *
 * A prefix whose Bucket does not exist lists nothing. A table pointing at a
 * Bucket the simulation never made is one nobody set data up for, and refusing
 * the query would fail every test written before anything was measured.
 */
export async function simAthenaObjectsUnder(
  request: SimAthenaListingRequest,
  prefix: string,
): Promise<readonly SimAthenaListedObject[]> {
  const location = simAthenaScannedLocation(prefix);

  return location === undefined ? [] : simAthenaObjectPages(request, location);
}

/**
 * Every object under every one of these prefixes, each key counted once.
 */
export async function simAthenaListedObjects(
  request: SimAthenaListingRequest,
  prefixes: readonly string[],
): Promise<readonly SimAthenaListedObject[]> {
  const listed = await Promise.all(
    prefixes.map(async (prefix) => simAthenaObjectsUnder(request, prefix)),
  );

  return simAthenaDistinctObjects(listed.flat());
}

/**
 * The same objects with any key reached more than once dropped.
 *
 * Two projected partitions never overlap, and a table location sitting above
 * one of them can.
 */
export function simAthenaDistinctObjects(
  objects: readonly SimAthenaListedObject[],
): readonly SimAthenaListedObject[] {
  const seen = new Set<string>();

  return objects.filter((object) => {
    const identity = `${object.bucket}/${object.key}`;

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);

    return true;
  });
}
