import type { SimS3Object } from "../../object/s3-object.js";
import type { SimS3BucketStorage } from "../../storage/s3-bucket-storage.js";
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
 */
export class SimS3LifecycleSweep {
  constructor(
    private readonly storage: SimS3BucketStorage,
    private readonly lifecycle: SimS3LifecycleConfiguration,
    private readonly now: Date,
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

    await this.storage.deleteObject(object.key);

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
      expiredKeys.values().map(async (key) => this.storage.deleteObject(key)),
    );

    return objects.filter((object) => !expiredKeys.has(object.key));
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
