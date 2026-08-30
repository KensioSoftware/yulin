import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import type { SimS3ObjectVersion } from "../../bucket/versioning/sim-s3-object-version.js";
import {
  SimS3InvalidRequest,
  SimS3MethodNotAllowed,
  SimS3NoSuchKey,
  SimS3NoSuchVersion,
} from "../../error/sim-s3.error.js";

/**
 * The version a retention or a legal hold is being put on.
 *
 * A request naming no version acts on the current one, which is what real S3
 * does. A Bucket without Object Lock has no version to put either on, and
 * refusing there is what stops a test believing a retention it set is holding
 * anything.
 */
export function simS3LockedVersion(
  bucket: SimS3Bucket,
  key: string,
  versionId: string | undefined,
): SimS3ObjectVersion {
  if (!bucket.getObjectLock().isEnabled) {
    throw new SimS3InvalidRequest(
      `Bucket ${bucket.bucketName} does not have Object Lock enabled`,
    );
  }

  const versions = bucket.getVersions();
  const version =
    versionId === undefined
      ? versions.current(key)
      : versions.find(key, versionId);

  if (version === undefined) {
    throw versionId === undefined
      ? new SimS3NoSuchKey(`No S3 Object named ${key}`)
      : new SimS3NoSuchVersion(`No version ${versionId} of S3 Object ${key}`);
  }

  if (version.isDeleteMarker) {
    throw new SimS3MethodNotAllowed(
      `Version ${version.versionId} of S3 Object ${key} is a delete marker`,
    );
  }

  return version;
}
