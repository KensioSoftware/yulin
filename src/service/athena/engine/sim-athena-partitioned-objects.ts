import { simAthenaObjectsUnder } from "../execution/sim-athena-listed-objects.js";
import type {
  SimAthenaListedObject,
  SimAthenaListingRequest,
} from "../execution/sim-athena-scanned-objects.js";
import type { SimAthenaTablePartition } from "../projection/sim-athena-projection-location.js";

/** One object to read, and the partition it was reached through. */
export interface SimAthenaPartitionedObject {
  readonly object: SimAthenaListedObject;
  readonly values: ReadonlyMap<string, string>;
}

/**
 * Every object one table's partitions reach, each one read once.
 *
 * A table location sitting above its own partitions reaches the same object
 * twice, and its rows belong to whichever partition got there first.
 */
export async function simAthenaPartitionedObjects(
  listing: SimAthenaListingRequest,
  partitions: readonly SimAthenaTablePartition[],
): Promise<readonly SimAthenaPartitionedObject[]> {
  const listed = await Promise.all(
    partitions.map(async (partition) => ({
      values: partition.values,
      objects: await simAthenaObjectsUnder(listing, partition.prefix),
    })),
  );
  const seen = new Set<string>();
  const objects: SimAthenaPartitionedObject[] = [];

  for (const partition of listed) {
    for (const object of partition.objects) {
      const identity = `${object.bucket}/${object.key}`;

      if (!seen.has(identity)) {
        seen.add(identity);
        objects.push({ object, values: partition.values });
      }
    }
  }

  return objects;
}
