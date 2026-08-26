import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The narrow slice of simulated S3 that listing what a query reads needs.
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

/** One object a query reads, named so that two Buckets never collide. */
export interface SimAthenaListedObject {
  readonly bucket: string;
  readonly key: string;
  readonly size: number;
}

/** What one listing goes through, and who it goes as. */
export interface SimAthenaListingRequest {
  readonly s3: SimAthenaScannedObjects;
  readonly caller: SimAwsCaller | undefined;
}
