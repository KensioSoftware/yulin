import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimS3Object } from "../object/s3-object.js";
import type { SimS3BucketStorage } from "../storage/s3-bucket-storage.js";
import { SimS3MultipartUploads } from "../upload/sim-s3-multipart-uploads.js";
import { SimS3BucketObjectLock } from "./lock/sim-s3-bucket-object-lock.js";
import { SimS3LifecycleConfiguration } from "./lifecycle/sim-s3-lifecycle-configuration.js";
import { SimS3NoncurrentSweep } from "./lifecycle/sim-s3-noncurrent-sweep.js";
import { SimS3LifecycleSweep } from "./lifecycle/sim-s3-lifecycle-sweep.js";
import { SimS3ObjectDeletion } from "./sim-s3-object-deletion.js";
import { SimS3TaggableObject } from "./tagging/sim-s3-taggable-object.js";
import type { SimS3BucketVersioning } from "./versioning/sim-s3-bucket-versioning.js";
import { SimS3BucketVersions } from "./versioning/sim-s3-bucket-versions.js";
import type { SimS3ObjectVersion } from "./versioning/sim-s3-object-version.js";

interface SimS3BucketObjectsProperties {
  readonly storage: SimS3BucketStorage;
  readonly lifecycle: SimS3LifecycleConfiguration;
  readonly clock: SimClock;
}

/**
 * What one simulated S3 Bucket stores, and what time does to it.
 *
 * Storage holds the current Object under each key and nothing else. Versions
 * and multipart uploads sit alongside it because neither is reachable through
 * a plain read of a key, and lifecycle rules are here because every read is
 * what applies them. Nothing sweeps a Bucket on a schedule.
 */
export class SimS3BucketObjects {
  public readonly versions = new SimS3BucketVersions();
  public readonly objectLock = new SimS3BucketObjectLock();

  private readonly clock: SimClock;
  private readonly uploads = new SimS3MultipartUploads();
  private storage: SimS3BucketStorage;
  private lifecycle: SimS3LifecycleConfiguration;

  constructor(properties: SimS3BucketObjectsProperties) {
    this.storage = properties.storage;
    this.lifecycle = properties.lifecycle;
    this.clock = properties.clock;
  }

  /**
   * Put an Object into storage, answering the version it was given.
   *
   * A Bucket that keeps no versions answers with nothing, which is what tells
   * a caller there is no `VersionId` to report. A version the Bucket did keep
   * starts under whatever default retention Object Lock puts on it.
   */
  async put(object: SimS3Object): Promise<SimS3ObjectVersion | undefined> {
    await this.storage.putObject(object);

    return this.objectLock.withDefaultRetention(
      this.versions.recordPut(object),
      object.lastModified,
    );
  }

  /**
   * Get an Object from storage.
   *
   * An Object a lifecycle rule has expired goes on the way past. Every read of
   * it then finds the key empty.
   */
  async get(key: string): Promise<SimS3Object | undefined> {
    return await this.sweep().object(await this.storage.getObject(key));
  }

  /**
   * List the Objects currently under a prefix.
   */
  async list(prefix?: string): Promise<SimS3Object[]> {
    return await this.sweep().objects(await this.storage.listObjects(prefix));
  }

  /**
   * Delete a key, answering what that did to the Bucket.
   *
   * A versioned Bucket writes a delete marker and keeps the Object behind it.
   * Real S3 writes the marker whether or not the key held anything, so a
   * delete of a key that was never written still leaves one.
   */
  async delete(key: string): Promise<SimS3ObjectDeletion> {
    if (!this.versions.keepsVersions) {
      return new SimS3ObjectDeletion({
        removedObject: await this.storage.deleteObject(key),
      });
    }

    return new SimS3ObjectDeletion({
      deleteMarker: await this.versions.markDeleted(
        this.storage,
        key,
        this.clock.now(),
      ),
    });
  }

  /**
   * Remove one version permanently, answering the version that went.
   *
   * Whatever the removal leaves at the head of the key becomes current, so
   * deleting a delete marker brings the Object under it back. A version Object
   * Lock is holding never gets that far.
   */
  async deleteVersion(
    key: string,
    versionId: string,
    bypassGovernance = false,
  ): Promise<SimS3ObjectVersion | undefined> {
    this.sweptVersions();
    this.objectLock.assertDeletable(
      this.versions.find(key, versionId),
      this.clock.now(),
      bypassGovernance,
    );

    return await this.versions.deleteVersion(this.storage, key, versionId);
  }

  /**
   * The Object a tagging request names, ready to be read or retagged.
   *
   * A request naming a version acts on that version, and one naming none acts
   * on whatever a plain read of the key answers with. The read happens either
   * way, because it is what applies the Bucket's rules, and a request naming a
   * version has no more effect on the Bucket than any other read of it.
   */
  async taggable(
    key: string,
    versionId: string | undefined,
  ): Promise<SimS3TaggableObject> {
    return SimS3TaggableObject.named({
      storage: this.storage,
      versions: this.sweptVersions(),
      key,
      versionId,
      stored: await this.get(key),
    });
  }

  /**
   * The versions this Bucket keeps, with whatever the rules have expired gone.
   *
   * Every read of the history goes through here, the way every read of an
   * Object goes through the Object sweep. A noncurrent version and a bare
   * delete marker are both invisible to storage, so this removes them without
   * touching it.
   */
  sweptVersions(): SimS3BucketVersions {
    new SimS3NoncurrentSweep(this.lifecycle, this.clock.now()).sweep(
      this.versions,
    );

    return this.versions;
  }

  /**
   * Apply a versioning configuration, giving what is already stored the null
   * version id where this is the Bucket's first.
   */
  async configureVersioning(versioning: SimS3BucketVersioning): Promise<void> {
    this.versions.configure(versioning, await this.list());
  }

  /**
   * The multipart uploads this Bucket has in progress.
   *
   * Kept apart from storage because the parts of an unfinished upload are not
   * Objects. Nothing that lists or reads a Bucket can see them, and only
   * completing the upload puts anything under a key.
   */
  multipartUploads(): SimS3MultipartUploads {
    const now = this.clock.now();
    this.uploads.discardAbandoned((upload) =>
      this.lifecycle.abandons(upload, now),
    );

    return this.uploads;
  }

  /**
   * Change the storage implementation behind this Bucket.
   */
  configureStorage(storage: SimS3BucketStorage): void {
    this.storage = storage;
  }

  /**
   * Replace this Bucket's lifecycle configuration.
   *
   * Real S3 holds one configuration per Bucket rather than a list of them, so
   * this replaces what was there instead of adding to it.
   */
  configureLifecycle(lifecycle: SimS3LifecycleConfiguration): void {
    this.lifecycle = lifecycle;
  }

  /**
   * Get this Bucket's lifecycle configuration.
   */
  getLifecycle(): SimS3LifecycleConfiguration {
    return this.lifecycle;
  }

  /**
   * Remove this Bucket's lifecycle configuration.
   *
   * Real S3 DeleteBucketLifecycle is idempotent, so this reports nothing about
   * whether there were rules to remove.
   */
  deleteLifecycle(): void {
    this.lifecycle = SimS3LifecycleConfiguration.empty();
  }

  /** What this Bucket's rules have expired, as they stand at this moment. */
  private sweep(): SimS3LifecycleSweep {
    return new SimS3LifecycleSweep(
      this.storage,
      this.lifecycle,
      this.clock.now(),
      this.versions,
    );
  }
}
