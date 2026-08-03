import type { SimS3Bucket, SimS3BucketName } from "./bucket/sim-s3-bucket.js";
import type * as simS3Commands from "./command/sim-s3-command.types.js";
import { SimS3GlobalRegistry } from "./sim-s3-global-registry.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { assertDefined } from "../../util/type-guard/defined.js";
import { FilesystemS3BucketStorage } from "./storage/filesystem/s3-filesystem-storage.js";
import {
  simS3BucketUrl,
  simS3ServiceUrl,
} from "./bucket/sim-s3-endpoint-url.js";
import { SimS3CloudFormationResourceFactory } from "./cfn/sim-cfn-s3-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimS3Commands, type SimS3Properties } from "./sim-s3-commands.js";
import { SimS3SdkCommandRouter } from "./sdk/sim-s3-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimS3RequestOptions } from "./command/sim-s3-request-options.js";

/**
 * Simulated S3. Handles SDK commands. Emulates AWS behaviour and state.
 * Scoped to an Account and Region, but has access to a global (as in
 * cross-region) registry of simulated S3 Buckets.
 */
export class SimS3 {
  private readonly buckets = new Map<SimS3BucketName, SimS3Bucket>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly s3GlobalRegistry: SimS3GlobalRegistry;
  private readonly commands: SimS3Commands;
  private readonly cfnFactory = new SimS3CloudFormationResourceFactory(this);
  private readonly sdkRouter = new SimS3SdkCommandRouter(this);

  constructor(properties: SimS3Properties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      s3GlobalRegistry = new SimS3GlobalRegistry(),
    } = properties;

    this.accountRegionScope = accountRegionScope;
    this.s3GlobalRegistry = s3GlobalRegistry;
    this.commands = new SimS3Commands({
      ...properties,
      accountRegionScope,
      s3GlobalRegistry,
      buckets: this.buckets,
    });
  }

  /**
   * Handle a Create Bucket Command from the SDK.
   */
  async createBucket(
    command: simS3Commands.SimCreateBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimCreateBucketCommandOutput> {
    return await this.commands.buckets.create(command, options);
  }

  /**
   * Handle a Put Bucket Policy Command from the SDK.
   */
  async putBucketPolicy(
    command: simS3Commands.SimPutBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketPolicyCommandOutput> {
    return await this.commands.bucketPolicies.put(command, options);
  }

  /**
   * Handle a Get Bucket Policy Command from the SDK.
   */
  async getBucketPolicy(
    command: simS3Commands.SimGetBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketPolicyCommandOutput> {
    return await this.commands.bucketPolicies.get(command, options);
  }

  /**
   * Handle a Delete Bucket Policy Command from the SDK.
   */
  async deleteBucketPolicy(
    command: simS3Commands.SimDeleteBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteBucketPolicyCommandOutput> {
    return await this.commands.bucketPolicies.delete(command, options);
  }

  /**
   * Handle a Put Public Access Block Command from the SDK.
   */
  async putPublicAccessBlock(
    command: simS3Commands.SimPutPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutPublicAccessBlockCommandOutput> {
    return await this.commands.publicAccessBlocks.put(command, options);
  }

  /**
   * Handle a Get Public Access Block Command from the SDK.
   */
  async getPublicAccessBlock(
    command: simS3Commands.SimGetPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetPublicAccessBlockCommandOutput> {
    return await this.commands.publicAccessBlocks.get(command, options);
  }

  /**
   * Handle a Delete Public Access Block Command from the SDK.
   */
  async deletePublicAccessBlock(
    command: simS3Commands.SimDeletePublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeletePublicAccessBlockCommandOutput> {
    return await this.commands.publicAccessBlocks.delete(command, options);
  }

  /**
   * Handle a Put Bucket Website Command from the SDK.
   */
  async putBucketWebsite(
    command: simS3Commands.SimPutBucketWebsiteCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketWebsiteCommandOutput> {
    return await this.commands.buckets.putWebsite(command, options);
  }

  /**
   * Handle a List Buckets Command from the SDK.
   */
  async listBuckets(
    command: simS3Commands.SimListBucketsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListBucketsCommandOutput> {
    return await this.commands.buckets.list(command, options);
  }

  /**
   * Handle a Put Object Command from the SDK.
   */
  async putObject(
    command: simS3Commands.SimPutObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectCommandOutput> {
    return await this.commands.objects.put(command, options);
  }

  /**
   * Handle a Get Object Command from the SDK.
   */
  async getObject(
    command: simS3Commands.SimGetObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetObjectCommandOutput> {
    return await this.commands.objects.get(command, options);
  }

  /**
   * Handle a Delete Object Command from the SDK.
   */
  async deleteObject(
    command: simS3Commands.SimDeleteObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteObjectCommandOutput> {
    return await this.commands.objects.delete(command, options);
  }

  /**
   * Handle a Delete Objects Command from the SDK.
   */
  async deleteObjects(
    command: simS3Commands.SimDeleteObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteObjectsCommandOutput> {
    return await this.commands.objects.deleteMany(command, options);
  }

  /**
   * Handle a List Objects Command from the SDK.
   */
  async listObjects(
    command: simS3Commands.SimListObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListObjectsCommandOutput> {
    return await this.commands.objects.list(command, options);
  }

  /**
   * Get a simulated S3 Bucket instance by name.
   */
  getSimBucketByName(
    bucketName: SimS3BucketName | string,
  ): SimS3Bucket | undefined {
    return this.buckets.get(bucketName as SimS3BucketName);
  }

  /**
   * Get the simulated S3 REST API endpoint URL for this Region.
   *
   * This is the endpoint an AWS SDK S3 client is configured with, so that the
   * client, and the presigner built on it, address simulated S3 the same way
   * they address the real thing.
   */
  getServiceUrl(): URL {
    return simS3ServiceUrl(this.accountRegionScope.regionName);
  }

  /**
   * Get the simulated S3 REST API endpoint URL for one Bucket.
   */
  getBucketUrl(bucketName: SimS3BucketName | string): URL {
    const bucket = this.getSimBucketByName(bucketName);
    assertDefined(bucket, `Sim S3 Bucket named ${bucketName}`);

    return simS3BucketUrl(
      bucket.bucketName,
      this.accountRegionScope.regionName,
    );
  }

  /**
   * Get the simulated S3 static website URL for a Bucket.
   */
  getBucketWebsiteUrl(bucketName: SimS3BucketName | string): URL {
    const bucket = this.getSimBucketByName(bucketName);
    assertDefined(bucket, `Sim S3 Bucket named ${bucketName}`);

    return bucket.getWebsiteUrl();
  }

  /**
   * Find the Account Region scope for a globally registered simulated S3 Bucket.
   */
  findBucketScope(
    bucketName: SimS3BucketName | string,
  ): SimAwsAccountRegionScope | undefined {
    return this.s3GlobalRegistry.findBucketScope(bucketName as SimS3BucketName);
  }

  /**
   * Have a simulated S3 Bucket use a local filesystem directory for storage.
   */
  mountBucketFilesystem(
    bucketName: SimS3BucketName | string,
    directoryPath: string,
  ): void {
    const bucket = this.getSimBucketByName(bucketName);
    assertDefined(bucket, `Sim S3 Bucket named ${bucketName}`);
    bucket.configureSimStorage(
      new FilesystemS3BucketStorage({ directoryPath }),
    );
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimCfnServiceResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}

export { type SimS3RequestOptions } from "./command/sim-s3-request-options.js";
