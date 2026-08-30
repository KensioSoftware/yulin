import { randomUUID } from "node:crypto";

import type { SimS3Object } from "../../object/s3-object.js";
import type { SimS3BucketStorage } from "../../storage/s3-bucket-storage.js";
import {
  SimS3BucketVersioning,
  simS3NullVersionId,
} from "./sim-s3-bucket-versioning.js";
import { SimS3ObjectVersion } from "./sim-s3-object-version.js";
import { SimS3ObjectVersions } from "./sim-s3-object-versions.js";

/**
 * The versioning of one simulated S3 Bucket, and the versions it has kept.
 *
 * Storage holds the current Object under each key and nothing else, which is
 * what lets every reader of a Bucket carry on unchanged. The version history
 * holds every version including that current one, and the two are kept in step
 * here: writing a delete marker takes the Object out of storage, and deleting
 * a version puts back whatever the removal left current.
 */
export class SimS3BucketVersions {
  private versioning = SimS3BucketVersioning.unversioned();
  private readonly history = new SimS3ObjectVersions();

  /**
   * How this Bucket is configured.
   */
  get configuration(): SimS3BucketVersioning {
    return this.versioning;
  }

  /**
   * Whether this Bucket holds a version history.
   */
  get keepsVersions(): boolean {
    return this.versioning.keepsVersions;
  }

  /**
   * Apply a versioning configuration to this Bucket.
   *
   * Enabling versioning over a Bucket that already holds Objects gives each of
   * them the null version id, which is what real S3 does with the Objects
   * written before the configuration arrived. They become the current version
   * of their key and stay readable by that id afterwards.
   */
  configure(
    versioning: SimS3BucketVersioning,
    stored: readonly SimS3Object[],
  ): void {
    const seeding = !this.versioning.keepsVersions && versioning.keepsVersions;
    this.versioning = versioning;

    if (!seeding) {
      return;
    }

    for (const object of stored) {
      this.history.add(SimS3ObjectVersion.nullVersionOf(object));
    }
  }

  /**
   * Record a write, answering the version it was given.
   *
   * A Bucket with versioning enabled gets a new id every time. A suspended one
   * writes over the null version, because real S3 holds one Object under that
   * id rather than a run of them. A Bucket nobody has configured records
   * nothing at all.
   */
  recordPut(object: SimS3Object): SimS3ObjectVersion | undefined {
    if (!this.versioning.keepsVersions) {
      return undefined;
    }

    const version = new SimS3ObjectVersion({
      versionId: this.nextVersionId(),
      key: object.key,
      createdAt: object.lastModified,
      object,
    });

    if (this.versioning.isEnabled) {
      this.history.add(version);
    } else {
      this.history.replace(version);
    }

    return version;
  }

  /**
   * Write a delete marker over a key and take the Object out of storage.
   *
   * Real S3 writes the marker whether or not the key held anything, so a
   * delete of a key that was never written still leaves one behind.
   */
  async markDeleted(
    storage: SimS3BucketStorage,
    key: string,
    at: Date,
  ): Promise<SimS3ObjectVersion> {
    const marker = new SimS3ObjectVersion({
      versionId: this.nextVersionId(),
      key,
      createdAt: at,
    });

    if (this.versioning.isEnabled) {
      this.history.add(marker);
    } else {
      this.history.replace(marker);
    }

    await storage.deleteObject(key);

    return marker;
  }

  /**
   * Remove one version permanently, answering the version that went.
   *
   * Whatever the removal leaves at the head of the key becomes current, so
   * deleting a delete marker brings the Object under it back and deleting the
   * current Object exposes the one written before it.
   */
  async deleteVersion(
    storage: SimS3BucketStorage,
    key: string,
    versionId: string,
  ): Promise<SimS3ObjectVersion | undefined> {
    if (!this.versioning.keepsVersions) {
      return await this.removeNullVersion(storage, key, versionId);
    }

    const removed = this.history.remove(key, versionId);

    if (removed !== undefined) {
      await this.restoreCurrent(storage, key);
    }

    return removed;
  }

  /**
   * One version of one key, by the id it was given.
   */
  find(key: string, versionId: string): SimS3ObjectVersion | undefined {
    return this.history.find(key, versionId);
  }

  /**
   * The version a read of this key without a version id answers with.
   */
  current(key: string): SimS3ObjectVersion | undefined {
    return this.history.current(key);
  }

  /**
   * Every version this Bucket holds, in the order a listing reports them.
   */
  list(prefix?: string): readonly SimS3ObjectVersion[] {
    return this.history.list(prefix);
  }

  /**
   * Remove the null version from a Bucket that keeps no history.
   *
   * Real S3 gives every Object in such a Bucket the null version id, so a
   * delete naming that id removes the Object rather than doing nothing. Any
   * other id names a version the Bucket never issued.
   */
  private async removeNullVersion(
    storage: SimS3BucketStorage,
    key: string,
    versionId: string,
  ): Promise<SimS3ObjectVersion | undefined> {
    const stored =
      versionId === simS3NullVersionId
        ? await storage.getObject(key)
        : undefined;

    if (stored === undefined) {
      return undefined;
    }

    await storage.deleteObject(key);

    return SimS3ObjectVersion.nullVersionOf(stored);
  }

  /**
   * Make storage hold whatever is now current under a key.
   */
  private async restoreCurrent(
    storage: SimS3BucketStorage,
    key: string,
  ): Promise<void> {
    const current = this.history.current(key);

    if (current === undefined || current.isDeleteMarker) {
      await storage.deleteObject(key);
      return;
    }

    await storage.putObject(current.object);
  }

  /**
   * The id the next version of anything gets.
   *
   * Real S3 version ids are opaque, and a suspended Bucket writes under the
   * null id rather than minting one.
   */
  private nextVersionId(): string {
    return this.versioning.isEnabled ? randomUUID() : simS3NullVersionId;
  }
}
