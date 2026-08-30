import type { Brand } from "../../../util/brand.type.js";
import { type SimClock, SimRealClock } from "../../../util/clock/sim-clock.js";
import type { SimS3BucketStorage } from "../storage/s3-bucket-storage.js";
import type { SimS3Object } from "../object/s3-object.js";
import { MemoryS3BucketStorage } from "../storage/s3-memory-storage.js";
import { SimS3BucketObjects } from "./sim-s3-bucket-objects.js";
import type { SimS3ObjectDeletion } from "./sim-s3-object-deletion.js";
import type { SimS3BucketObjectLock } from "./lock/sim-s3-bucket-object-lock.js";
import type { SimS3BucketVersioning } from "./versioning/sim-s3-bucket-versioning.js";
import type { SimS3BucketVersions } from "./versioning/sim-s3-bucket-versions.js";
import type { SimS3ObjectVersion } from "./versioning/sim-s3-object-version.js";
import { SimS3BucketWebsite } from "./website/sim-s3-bucket-website.js";
import { SimS3PublicAccessBlock } from "./public-access/sim-s3-public-access-block.js";
import { SimS3NotificationConfiguration } from "./notification/sim-s3-notification-configuration.js";
import { SimS3LifecycleConfiguration } from "./lifecycle/sim-s3-lifecycle-configuration.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { simS3BucketWebsiteUrl } from "./website/sim-s3-bucket-website-url.js";
import { validateS3BucketName } from "./validate/validate-s3-bucket-name.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";
import { SimS3BucketSystemMetadata } from "./sim-s3-bucket-system-metadata.js";
import type { SimS3MultipartUploads } from "../upload/sim-s3-multipart-uploads.js";

export type SimS3BucketName = Brand<string, "SimS3BucketName">;

interface SimS3BucketProperties {
  readonly bucketName: SimS3BucketName | string;
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly storage?: SimS3BucketStorage;
  readonly website?: SimS3BucketWebsite;
  readonly policy?: SimIamPolicyDocument | undefined;
  readonly publicAccessBlock?: SimS3PublicAccessBlock;
  readonly notifications?: SimS3NotificationConfiguration;
  readonly lifecycle?: SimS3LifecycleConfiguration;
  /**
   * The simulation's sense of time, which is what a lifecycle rule is measured
   * against. A Bucket made outside a simulated environment has none to be
   * given, and runs on the host clock.
   */
  readonly clock?: SimClock;
  /**
   * When the Bucket came into being, in simulated time.
   *
   * Real S3 reports this on every Bucket a listing returns, and the `aws` CLI
   * reads it from each entry, so a Bucket without one cannot be listed.
   */
  readonly creationDate?: Date;
}

/**
 * Simulated S3 Bucket.
 */
export class SimS3Bucket {
  public readonly bucketName: SimS3BucketName;
  public readonly creationDate: Date;

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly systemMetadata = new SimS3BucketSystemMetadata();
  private readonly objects: SimS3BucketObjects;
  private website: SimS3BucketWebsite;
  private policy: SimIamPolicyDocument | undefined;
  private publicAccessBlock: SimS3PublicAccessBlock;
  private notifications: SimS3NotificationConfiguration;

  constructor(properties: SimS3BucketProperties) {
    const {
      bucketName,
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      storage = new MemoryS3BucketStorage(),
      website = new SimS3BucketWebsite(),
      policy,
      publicAccessBlock = SimS3PublicAccessBlock.blockingAll(),
      notifications = SimS3NotificationConfiguration.empty(),
      lifecycle = SimS3LifecycleConfiguration.empty(),
      clock = new SimRealClock(),
      creationDate = clock.now(),
    } = properties;

    validateS3BucketName(bucketName);

    this.bucketName = bucketName;
    this.accountRegionScope = accountRegionScope;
    this.objects = new SimS3BucketObjects({ storage, lifecycle, clock });
    this.website = website;
    this.policy = policy;
    this.publicAccessBlock = publicAccessBlock;
    this.notifications = notifications;
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
   * Configure static website hosting for this simulated S3 Bucket.
   */
  configureWebsite(website: SimS3BucketWebsite): void {
    this.website = website;
  }

  /**
   * Get static website configuration for this simulated S3 Bucket.
   */
  getWebsite(): SimS3BucketWebsite {
    return this.website;
  }

  /**
   * Configure the Bucket resource policy.
   */
  configurePolicy(policy: SimIamPolicyDocument): void {
    this.policy = policy;
  }

  /**
   * Get the Bucket resource policy.
   */
  getPolicy(): SimIamPolicyDocument | undefined {
    return this.policy;
  }

  /**
   * Remove the Bucket resource policy.
   *
   * Real S3 DeleteBucketPolicy is idempotent, so this reports nothing about
   * whether there was a policy to remove.
   */
  deletePolicy(): void {
    this.policy = undefined;
  }

  /**
   * Replace this Bucket's Block Public Access settings.
   */
  configurePublicAccessBlock(publicAccessBlock: SimS3PublicAccessBlock): void {
    this.publicAccessBlock = publicAccessBlock;
  }

  /**
   * Get this Bucket's Block Public Access settings.
   */
  getPublicAccessBlock(): SimS3PublicAccessBlock {
    return this.publicAccessBlock;
  }

  /**
   * Remove this Bucket's Block Public Access settings.
   *
   * Removing the configuration returns the Bucket to the all-enabled state a
   * new Bucket starts in, rather than leaving it unprotected.
   */
  deletePublicAccessBlock(): void {
    this.publicAccessBlock = SimS3PublicAccessBlock.blockingAll();
  }

  /**
   * Replace this Bucket's event notification configuration.
   *
   * Real S3 holds one configuration per Bucket rather than a list of them, so
   * this replaces what was there instead of adding to it.
   */
  configureNotifications(notifications: SimS3NotificationConfiguration): void {
    this.notifications = notifications;
  }

  /**
   * Get this Bucket's event notification configuration.
   */
  getNotifications(): SimS3NotificationConfiguration {
    return this.notifications;
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
      this.website,
    );
  }
}
