import type { Brand } from "../../../util/brand.type.js";
import { SimRealClock } from "../../../util/clock/sim-clock.js";
import type { SimS3BucketStorage } from "../storage/s3-bucket-storage.js";
import type { SimS3Object } from "../object/s3-object.js";
import { MemoryS3BucketStorage } from "../storage/s3-memory-storage.js";
import { SimS3BucketObjects } from "./sim-s3-bucket-objects.js";
import type { SimS3ObjectDeletion } from "./sim-s3-object-deletion.js";
import type { SimS3TaggableObject } from "./tagging/sim-s3-taggable-object.js";
import type { SimS3BucketObjectLock } from "./lock/sim-s3-bucket-object-lock.js";
import type { SimS3BucketVersioning } from "./versioning/sim-s3-bucket-versioning.js";
import type { SimS3BucketVersions } from "./versioning/sim-s3-bucket-versions.js";
import type { SimS3ObjectVersion } from "./versioning/sim-s3-object-version.js";
import { SimS3LifecycleConfiguration } from "./lifecycle/sim-s3-lifecycle-configuration.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simS3BucketWebsiteUrl } from "./website/sim-s3-bucket-website-url.js";
import { validateS3BucketName } from "./validate/validate-s3-bucket-name.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";
import { SimS3BucketConfiguration } from "./sim-s3-bucket-configuration.js";
import { SimS3BucketSystemMetadata } from "./sim-s3-bucket-system-metadata.js";
import type { SimS3MultipartUploads } from "../upload/sim-s3-multipart-uploads.js";
import type { SimS3BucketProperties } from "./sim-s3-bucket-properties.js";

export type SimS3BucketName = Brand<string, "SimS3BucketName">;

/**
 * Simulated S3 Bucket.
 */
export class SimS3Bucket extends SimS3BucketConfiguration {
  public readonly bucketName: SimS3BucketName;
  public readonly creationDate: Date;

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly systemMetadata = new SimS3BucketSystemMetadata();
  private readonly objects: SimS3BucketObjects;

  constructor(properties: SimS3BucketProperties) {
    super(properties);

    const {
      bucketName,
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      storage = new MemoryS3BucketStorage(),
      lifecycle = SimS3LifecycleConfiguration.empty(),
      clock = new SimRealClock(),
      creationDate = clock.now(),
    } = properties;

    validateS3BucketName(bucketName);

    this.bucketName = bucketName;
    this.accountRegionScope = accountRegionScope;
    this.objects = new SimS3BucketObjects({ storage, lifecycle, clock });
    this.creationDate = creationDate;
  }

  /** Put an Object into storage, answering the version it was given, if any. */
  async putObject(
    object: SimS3Object,
  ): Promise<SimS3ObjectVersion | undefined> {
    return await this.objects.put(object);
  }

  /** Get a simulated S3 Object from storage. */
  async getObject(key: string): Promise<SimS3Object | undefined> {
    return await this.objects.get(key);
  }

  /** List simulated S3 Objects from storage. */
  async listObjects(prefix?: string): Promise<SimS3Object[]> {
    return await this.objects.list(prefix);
  }

  /**
   * Delete a key, answering what that did to the Bucket.
   *
   * Real S3 DeleteObject is idempotent, so a key that was not there is not an
   * error. What happened is still reported, because the event notification a
   * deletion raises depends on it.
   */
  async deleteObject(key: string): Promise<SimS3ObjectDeletion> {
    return await this.objects.delete(key);
  }

  /**
   * Remove one version of a key permanently, answering the version that went.
   *
   * Whatever the removal leaves at the head of the key becomes current, so
   * deleting a delete marker brings the Object under it back. Object Lock
   * refuses the removal of a version it is holding.
   */
  async deleteObjectVersion(
    key: string,
    versionId: string,
    bypassGovernance = false,
  ): Promise<SimS3ObjectVersion | undefined> {
    return await this.objects.deleteVersion(key, versionId, bypassGovernance);
  }

  /**
   * The Object a tagging request names, ready to be read or retagged.
   *
   * A request naming no version acts on whatever a plain read of the key
   * answers with, which is what real S3 does.
   */
  async taggableObject(
    key: string,
    versionId?: string,
  ): Promise<SimS3TaggableObject> {
    return await this.objects.taggable(key, versionId);
  }

  /** The versions this Bucket keeps, and whether it keeps any. */
  getVersions(): SimS3BucketVersions {
    return this.objects.sweptVersions();
  }

  /** How this Bucket is locked, and what that does to a write and a delete. */
  getObjectLock(): SimS3BucketObjectLock {
    return this.objects.objectLock;
  }

  /**
   * Apply a versioning configuration to this Bucket.
   */
  async configureVersioning(versioning: SimS3BucketVersioning): Promise<void> {
    await this.objects.configureVersioning(versioning);
  }

  /**
   * The multipart uploads this Bucket has in progress.
   */
  getMultipartUploads(): SimS3MultipartUploads {
    return this.objects.multipartUploads();
  }

  /**
   * Change the storage implementation for this simulated S3 Bucket.
   */
  configureSimStorage(storage: SimS3BucketStorage): void {
    this.objects.configureStorage(storage);
  }

  /**
   * What this Bucket has been told about the Objects under its keys, beyond
   * what the Objects themselves carry.
   *
   * A deployment into the Bucket declares here what it publishes, and storage
   * that cannot hold metadata reads it back, so a directory mounted in place of
   * those Objects is served with the headers they had.
   */
  getDeclaredSystemMetadata(): SimS3BucketSystemMetadata {
    return this.systemMetadata;
  }

  /**
   * Replace this Bucket's lifecycle configuration.
   *
   * Real S3 holds one configuration per Bucket rather than a list of them, so
   * this replaces what was there instead of adding to it.
   */
  configureLifecycle(lifecycle: SimS3LifecycleConfiguration): void {
    this.objects.configureLifecycle(lifecycle);
  }

  /**
   * Get this Bucket's lifecycle configuration.
   */
  getLifecycle(): SimS3LifecycleConfiguration {
    return this.objects.getLifecycle();
  }

  /**
   * Remove this Bucket's lifecycle configuration.
   *
   * Real S3 DeleteBucketLifecycle is idempotent, so this reports nothing about
   * whether there were rules to remove.
   */
  deleteLifecycle(): void {
    this.objects.deleteLifecycle();
  }

  /**
   * Get the simulated AWS account Region scope for this Bucket.
   */
  getAccountRegionScope(): SimAwsAccountRegionScope {
    return this.accountRegionScope;
  }

  /**
   * Get the simulated S3 static website URL for this Bucket.
   */
  getWebsiteUrl(): URL {
    return simS3BucketWebsiteUrl(
      this.bucketName,
      this.accountRegionScope,
      this.getWebsite(),
    );
  }
}
