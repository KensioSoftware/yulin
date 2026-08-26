import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaScannedObjects } from "./sim-athena-scanned-bytes.js";
import type { SimAthenaScannedLocation } from "./sim-athena-scanned-location.js";

/**
 * One page of a listing, or nothing where the Bucket is absent.
 *
 * Every other failure is left to raise. A caller refused by IAM fails the
 * query, which is what real Athena does when it cannot read a table's data.
 */
export async function simAthenaScannedPage(
  s3: SimAthenaScannedObjects,
  location: SimAthenaScannedLocation,
  continuationToken: string | undefined,
  options: { caller: SimAwsCaller } | undefined,
): Promise<
  Awaited<ReturnType<SimAthenaScannedObjects["listObjectsV2"]>> | undefined
> {
  try {
    return await s3.listObjectsV2(
      {
        input: {
          Bucket: location.bucket,
          Prefix: location.prefix,
          ContinuationToken: continuationToken,
        },
      },
      options,
    );
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchBucket") {
      return undefined;
    }

    throw error;
  }
}
