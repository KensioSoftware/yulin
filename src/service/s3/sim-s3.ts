import type { SimS3Bucket, SimS3BucketName } from "./bucket/sim-s3-bucket.js";
import type * as simS3Commands from "./command/sim-s3-command.types.js";
import { SimS3GlobalRegistry } from "./sim-s3-global-registry.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { SimS3BucketAccess } from "./bucket/sim-s3-bucket-access.js";
import { SimS3CloudFormationResourceFactory } from "./cfn/sim-cfn-s3-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimS3Commands, type SimS3Properties } from "./sim-s3-commands.js";
import { SimS3SdkCommandRouter } from "./sdk/sim-s3-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimS3RequestOptions } from "./command/sim-s3-request-options.js";
import type { SimS3NotificationDeliveryFailure } from "./notification/sim-s3-notification-failures.js";
import type { SimS3MountFilesystemOptions } from "./mount/sim-s3-mount.type.js";

/**
 * Simulated S3. Handles SDK commands. Emulates AWS behaviour and state.
 * Scoped to an Account and Region, but has access to a global (as in
 * cross-region) registry of simulated S3 Buckets.
 */
export class SimS3 {
  private readonly buckets = new Map<SimS3BucketName, SimS3Bucket>();

  private readonly commands: SimS3Commands;
  private readonly bucketAccess: SimS3BucketAccess;
  private readonly cfnFactory = new SimS3CloudFormationResourceFactory(this);
  private readonly sdkRouter = new SimS3SdkCommandRouter(this);

  constructor(properties: SimS3Properties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      s3GlobalRegistry = new SimS3GlobalRegistry(),
    } = properties;

    this.commands = new SimS3Commands({
      ...properties,
      accountRegionScope,
      s3GlobalRegistry,
      buckets: this.buckets,
    });
    this.bucketAccess = new SimS3BucketAccess({
      buckets: this.buckets,
      accountRegionScope,
      s3GlobalRegistry,
    });
  }

  /** Handle a Create Bucket Command from the SDK. */
  async createBucket(
    command: simS3Commands.SimCreateBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimCreateBucketCommandOutput> {
    return await this.commands.buckets.create(command, options);
  }

  /** Handle a Delete Bucket Command from the SDK. */
  async deleteBucket(
    command: simS3Commands.SimDeleteBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteBucketCommandOutput> {
    return await this.commands.buckets.delete(command, options);
  }

  /** Handle a Put Bucket Policy Command from the SDK. */
  async putBucketPolicy(
    command: simS3Commands.SimPutBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketPolicyCommandOutput> {
    return await this.commands.bucketPolicies.put(command, options);
  }

  /** Handle a Get Bucket Policy Command from the SDK. */
  async getBucketPolicy(
    command: simS3Commands.SimGetBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketPolicyCommandOutput> {
    return await this.commands.bucketPolicies.get(command, options);
  }

  /** Handle a Delete Bucket Policy Command from the SDK. */
  async deleteBucketPolicy(
    command: simS3Commands.SimDeleteBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteBucketPolicyCommandOutput> {
    return await this.commands.bucketPolicies.delete(command, options);
  }

  /** Handle a Put Public Access Block Command from the SDK. */
  async putPublicAccessBlock(
    command: simS3Commands.SimPutPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutPublicAccessBlockCommandOutput> {
    return await this.commands.publicAccessBlocks.put(command, options);
  }

  /** Handle a Get Public Access Block Command from the SDK. */
  async getPublicAccessBlock(
    command: simS3Commands.SimGetPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetPublicAccessBlockCommandOutput> {
    return await this.commands.publicAccessBlocks.get(command, options);
  }

  /** Handle a Delete Public Access Block Command from the SDK. */
  async deletePublicAccessBlock(
    command: simS3Commands.SimDeletePublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeletePublicAccessBlockCommandOutput> {
    return await this.commands.publicAccessBlocks.delete(command, options);
  }

  /** Handle a Put Bucket Website Command from the SDK. */
  async putBucketWebsite(
    command: simS3Commands.SimPutBucketWebsiteCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketWebsiteCommandOutput> {
    return await this.commands.buckets.putWebsite(command, options);
  }

  /** Handle a Put Bucket Notification Configuration Command from the SDK. */
  async putBucketNotificationConfiguration(
    command: simS3Commands.SimPutBucketNotificationConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketNotificationConfigurationCommandOutput> {
    return await this.commands.notifications.put(command, options);
  }

  /** Handle a Get Bucket Notification Configuration Command from the SDK. */
  async getBucketNotificationConfiguration(
    command: simS3Commands.SimGetBucketNotificationConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketNotificationConfigurationCommandOutput> {
    return await this.commands.notifications.get(command, options);
  }

  /** Handle a List Buckets Command from the SDK. */
  async listBuckets(
    command: simS3Commands.SimListBucketsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListBucketsCommandOutput> {
    return await this.commands.buckets.list(command, options);
  }

  /** Handle a Put Object Command from the SDK. */
  async putObject(
    command: simS3Commands.SimPutObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectCommandOutput> {
    return await this.commands.objects.put(command, options);
  }

  /** Handle a Get Object Command from the SDK. */
  async getObject(
    command: simS3Commands.SimGetObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetObjectCommandOutput> {
    return await this.commands.objects.get(command, options);
  }

  /** Handle a Delete Object Command from the SDK. */
  async deleteObject(
    command: simS3Commands.SimDeleteObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteObjectCommandOutput> {
    return await this.commands.objects.delete(command, options);
  }

  /** Handle a Delete Objects Command from the SDK. */
  async deleteObjects(
    command: simS3Commands.SimDeleteObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteObjectsCommandOutput> {
    return await this.commands.objects.deleteMany(command, options);
  }

  /** Handle a List Objects Command from the SDK. */
  async listObjects(
    command: simS3Commands.SimListObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListObjectsCommandOutput> {
    return await this.commands.objects.list(command, options);
  }

  /** Handle a List Objects V2 Command from the SDK. */
  async listObjectsV2(
    command: simS3Commands.SimListObjectsV2Command,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListObjectsV2CommandOutput> {
    return await this.commands.objects.listV2(command, options);
  }

  /**
   * Change how many keys one page of an Object listing holds, which real S3
   * fixes at a thousand.
   *
   * Lowering it is how a test gets a caller to walk a continuation without
   * storing a thousand and one Objects to provoke one.
   */
  configureMaxKeysPerPage(maxKeys: number): void {
    this.commands.objects.configureMaxKeysPerPage(maxKeys);
  }

  /** Get a simulated S3 Bucket instance by name. */
  getSimBucketByName(
    bucketName: SimS3BucketName | string,
  ): SimS3Bucket | undefined {
    return this.bucketAccess.find(bucketName);
  }

  /**
   * Get the Bucket event notifications this S3 could not deliver, which is the
   * only place a handler that threw or a destination that refused shows up:
   * real S3 tells the caller who wrote the Object nothing about a delivery.
   */
  getNotificationDeliveryFailures(): readonly SimS3NotificationDeliveryFailure[] {
    return this.commands.objectNotifier.deliveryFailures;
  }

  /**
   * Get the simulated S3 REST API endpoint URL for this Region, which is what
   * an AWS SDK S3 client, and the presigner built on it, is configured with.
   */
  getServiceUrl(): URL {
    return this.bucketAccess.serviceUrl();
  }

  /** Get the simulated S3 REST API endpoint URL for one Bucket. */
  getBucketUrl(bucketName: SimS3BucketName | string): URL {
    return this.bucketAccess.url(bucketName);
  }

  /** Get the simulated S3 static website URL for a Bucket. */
  getBucketWebsiteUrl(bucketName: SimS3BucketName | string): URL {
    return this.bucketAccess.websiteUrl(bucketName);
  }

  /**
   * Find the Account Region scope for a globally registered simulated S3 Bucket.
   */
  findBucketScope(
    bucketName: SimS3BucketName | string,
  ): SimAwsAccountRegionScope | undefined {
    return this.bucketAccess.scopeOf(bucketName);
  }

  /**
   * Have a simulated S3 Bucket use a local filesystem directory for storage,
   * watching it when `{ reload: srv }` says where to reload.
   *
   * See `SimS3BucketAccess.mountFilesystem`, which describes what a mounted
   * directory does about the metadata a file cannot carry.
   */
  mountBucketFilesystem(
    bucketName: SimS3BucketName | string,
    directoryPath: string,
    options: SimS3MountFilesystemOptions = {},
  ): void {
    this.bucketAccess.mountFilesystem(bucketName, directoryPath, options);
  }

  /** The mounted directories being watched for changes. */
  watchedMountedDirectories(): readonly string[] {
    return this.bucketAccess.watchedMounts();
  }

  /** Stop watching mounted directories, as `close` does. */
  stopWatchingMountedDirectories(): void {
    this.bucketAccess.stopWatchingMounts();
  }

  /**
   * Let go of everything this simulated S3 is holding open.
   *
   * The mounted directory watches, which is what `SimAws.close()` reaches to
   * release when a simulated environment is closed as a whole. A watch holds an
   * open filesystem handle, so a process with one open does not exit on its
   * own: a dev process wants exactly that, and anything with an end, such as a
   * test, closes when it is done. The Buckets and the Objects in them are left
   * where they are, mounts included: this is the open filesystem handles going,
   * not the storage behind them.
   */
  close(): void {
    this.stopWatchingMountedDirectories();
  }

  /** Get this service's CloudFormation Resource factory. */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.cfnFactory;
  }

  /** Get this service's SDK Command router for SDK client interception. */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}

export { type SimS3RequestOptions } from "./command/sim-s3-request-options.js";
