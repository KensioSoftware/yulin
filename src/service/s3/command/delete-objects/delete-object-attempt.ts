import type { SimS3ObjectVersion } from "../../bucket/versioning/sim-s3-object-version.js";

/**
 * What one key of a DeleteObjects request came to.
 *
 * A batch deletion carries on past a key it could not remove, so the failure
 * travels with the key it belongs to rather than being raised. So does the
 * delete marker, which a versioned Bucket reports per key alongside the id it
 * was written under.
 */
export class DeleteObjectAttempt {
  public readonly key: string;
  public readonly error: unknown;
  public readonly deleteMarker: SimS3ObjectVersion | undefined;

  constructor(key: string, error?: unknown, deleteMarker?: SimS3ObjectVersion) {
    this.key = key;
    this.error = error;
    this.deleteMarker = deleteMarker;
  }
}
