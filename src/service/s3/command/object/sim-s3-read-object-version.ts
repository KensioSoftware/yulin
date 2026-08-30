import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3NullVersionId } from "../../bucket/versioning/sim-s3-bucket-versioning.js";
import {
  SimS3MethodNotAllowed,
  SimS3NoSuchVersion,
} from "../../error/sim-s3.error.js";
import type { SimS3ObjectLock } from "../../bucket/lock/sim-s3-object-lock.js";
import type { SimS3Object } from "../../object/s3-object.js";

/**
 * An Object a read resolved, and the version it came from.
 *
 * The version id travels with the Object because every read reports it, and a
 * Bucket without versioning has none to report.
 */
export interface SimS3ReadObjectVersion {
  readonly object: SimS3Object;
  readonly versionId: string | undefined;
  /**
   * What Object Lock holds against the version read.
   *
   * A Bucket keeping no versions has none, and a Bucket that keeps them but
   * has never been locked has an empty one. Both report nothing.
   */
  readonly lock: SimS3ObjectLock | undefined;
}

/**
 * Read one version of a key, or the current one where no version was named.
 *
 * A read without a `VersionId` goes through the Bucket, which is what applies
 * lifecycle rules and what hides an Object behind a delete marker. A read that
 * names one goes to the version history instead, so an Object under a marker
 * is still readable by its own id.
 *
 * Answering `undefined` means the key holds nothing to read, which each caller
 * turns into the error its own command answers with. A named version that was
 * never issued is a different thing and is raised here, because NoSuchVersion
 * is what real S3 answers rather than the missing-key error.
 */
export async function simS3ReadObjectVersion(
  bucket: SimS3Bucket,
  key: string,
  versionId?: string,
): Promise<SimS3ReadObjectVersion | undefined> {
  const versions = bucket.getVersions();

  if (versionId === undefined) {
    const object = await bucket.getObject(key);

    if (object === undefined) {
      return undefined;
    }

    const current = versions.current(key);

    return { object, versionId: current?.versionId, lock: current?.lock };
  }

  if (!versions.keepsVersions) {
    return await simS3ReadUnversioned(bucket, key, versionId);
  }

  const version = versions.find(key, versionId);

  if (version === undefined) {
    throw new SimS3NoSuchVersion(`No version ${versionId} of S3 Object ${key}`);
  }

  if (version.isDeleteMarker) {
    throw new SimS3MethodNotAllowed(
      `Version ${versionId} of S3 Object ${key} is a delete marker`,
    );
  }

  return { object: version.object, versionId, lock: version.lock };
}

/**
 * Read a named version from a Bucket that keeps none.
 *
 * Real S3 gives every Object in such a Bucket the null version id, so that one
 * reads the Object and any other names a version the Bucket never issued.
 */
async function simS3ReadUnversioned(
  bucket: SimS3Bucket,
  key: string,
  versionId: string,
): Promise<SimS3ReadObjectVersion | undefined> {
  if (versionId !== simS3NullVersionId) {
    throw new SimS3NoSuchVersion(`No version ${versionId} of S3 Object ${key}`);
  }

  const object = await bucket.getObject(key);

  return object === undefined
    ? undefined
    : { object, versionId: undefined, lock: undefined };
}
