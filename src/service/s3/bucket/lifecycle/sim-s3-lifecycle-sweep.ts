import type { SimS3Object } from "../../object/s3-object.js";
import type { SimS3BucketStorage } from "../../storage/s3-bucket-storage.js";
import type { SimS3BucketVersions } from "../versioning/sim-s3-bucket-versions.js";
import type {
  SimS3LifecycleConfiguration,
  SimS3LifecycleObject,
} from "./sim-s3-lifecycle-configuration.js";

/**
 * One pass over what a Bucket's lifecycle rules have expired.
 *
 * A Bucket makes one of these per read and throws it away, because both halves
 * of it can be replaced while the Bucket is running. `configureSimStorage`
 * swaps the storage, and PutBucketLifecycleConfiguration replaces the rules.
 *
 * Expiry happens here rather than on a schedule, which leaves a Bucket
 * carrying no rules paying one comparison for the check. See
 * `simS3ObjectExpiryInstant` for why the boundary is a pure function of the
 * current time.
 *
 * Nothing is announced. Real S3 raises `s3:LifecycleExpiration:Delete` for an
 * expiry, and that event family is among the ones simulated S3 leaves out.
 *
 * What an expiry does depends on whether the Bucket keeps versions. Real S3
 * expires the current version of a key on a versioned Bucket by writing a
 * delete marker over it, leaving the version itself for a
 * `NoncurrentVersionExpiration` rule to remove later, so that is what happens
 * here too. A Bucket keeping no versions loses the Object outright.
 */
export class SimS3LifecycleSweep {
  constructor(
    private readonly storage: SimS3BucketStorage,
    private readonly lifecycle: SimS3LifecycleConfiguration,
    private readonly now: Date,
    private readonly versions: SimS3BucketVersions,
  ) {}

  /**
   * Remove one Object if the rules have expired it.
   *
   * The Object is answered when it survives and nothing is when it does not,
   * so a read hands on whatever it gets. A key holding nothing stays nothing.
   */
  async object(
    object: SimS3Object | undefined,
  ): Promise<SimS3Object | undefined> {
    if (object === undefined || !this.expires(object)) {
      return object;
    }

    await this.expire(object.key);

    return undefined;
  }

  /**
   * Remove the Objects among these the rules have expired, and answer with the
   * ones still there.
   */
  async objects(objects: readonly SimS3Object[]): Promise<SimS3Object[]> {
    if (this.lifecycle.isEmpty) {
      return [...objects];
    }

    const expiredKeys = new Set(
      objects.filter((object) => this.expires(object)).map(({ key }) => key),
    );

    await Promise.all(
      expiredKeys.values().map(async (key) => {
        await this.expire(key);
      }),
    );

    return objects.filter((object) => !expiredKeys.has(object.key));
  }

  /**
   * Take one expired key out of what a read of the Bucket can see.
   *
   * A versioned Bucket keeps the bytes and hides them behind a marker, which
   * is what leaves the version there for `NoncurrentVersionExpiration` to
   * find. Everything else loses the Object.
   */
  private async expire(key: string): Promise<void> {
    if (this.versions.keepsVersions) {
      await this.versions.markDeleted(this.storage, key, this.now);
      return;
    }

    await this.storage.deleteObject(key);
  }

  private expires(object: SimS3Object): boolean {
    return (
      !this.lifecycle.isEmpty &&
      this.lifecycle.expires(lifecycleObject(object), this.now)
    );
  }
}

/**
 * An Object as a rule reads it. The size is the length of the bytes the
 * Bucket holds, which is what `ContentLength` reports for the same Object.
 */
function lifecycleObject(object: SimS3Object): SimS3LifecycleObject {
  return {
    key: object.key,
    size: object.body.length,
    lastModified: object.lastModified,
  };
}
