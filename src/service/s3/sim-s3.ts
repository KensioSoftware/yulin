import type { SimS3Bucket, SimS3BucketName } from "./bucket/sim-s3-bucket.js";
import { SimS3CommandHandlers } from "./command/sim-s3-command-handlers.js";
import { SimS3GlobalRegistry } from "./sim-s3-global-registry.js";
import {
  simS3BucketUrl,
  simS3ServiceUrl,
} from "./bucket/sim-s3-endpoint-url.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { assertDefined } from "../../util/type-guard/defined.js";
import { FilesystemS3BucketStorage } from "./storage/filesystem/s3-filesystem-storage.js";
import type {
  SimPutObjectCommand,
  SimPutObjectCommandOutput,
} from "./command/put-object/put-object.command.js";
import type {
  SimPutBucketWebsiteCommand,
  SimPutBucketWebsiteCommandOutput,
} from "./command/put-bucket-website/put-bucket-website.command.js";
import type {
  SimListObjectsCommand,
  SimListObjectsCommandOutput,
} from "./command/list-objects/list-objects.command.js";
import type {
  SimListBucketsCommand,
  SimListBucketsCommandOutput,
} from "./command/list-buckets/list-buckets.command.js";
import type {
  SimGetObjectCommand,
  SimGetObjectCommandOutput,
} from "./command/get-object/get-object.command.js";
import type {
  SimCreateBucketCommand,
  SimCreateBucketCommandOutput,
} from "./command/create-bucket/create-bucket.command.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import { SimS3CloudFormationResourceFactory } from "./cfn/sim-cfn-s3-resource-factory.js";
import type { SimCfnServiceResourceFactory } from "../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimPutBucketPolicyCommand,
  SimPutBucketPolicyCommandOutput,
} from "./command/put-bucket-policy/put-bucket-policy.command.js";
import type {
  SimGetBucketPolicyCommand,
  SimGetBucketPolicyCommandOutput,
} from "./command/get-bucket-policy/get-bucket-policy.command.js";
import type {
  SimDeleteBucketPolicyCommand,
  SimDeleteBucketPolicyCommandOutput,
} from "./command/delete-bucket-policy/delete-bucket-policy.command.js";
import { SimS3SdkCommandRouter } from "./sdk/sim-s3-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";

export interface SimS3RequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimS3Properties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly s3GlobalRegistry?: SimS3GlobalRegistry;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3. Handles SDK commands. Emulates AWS behaviour and state.
 * Scoped to an Account and Region, but has access to a global (as in
 * cross-region) registry of simulated S3 Buckets.
 */
export class SimS3 {
  private readonly buckets = new Map<SimS3BucketName, SimS3Bucket>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly s3GlobalRegistry: SimS3GlobalRegistry;
  private readonly commands: SimS3CommandHandlers;
  private readonly cfnFactory = new SimS3CloudFormationResourceFactory(this);
  private readonly sdkRouter = new SimS3SdkCommandRouter(this);

  constructor(properties: SimS3Properties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      s3GlobalRegistry = new SimS3GlobalRegistry(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.accountRegionScope = accountRegionScope;
    this.s3GlobalRegistry = s3GlobalRegistry;
    this.commands = new SimS3CommandHandlers({
      accountRegionScope,
      buckets: this.buckets,
      s3GlobalRegistry,
      iam,
      background,
    });
  }

  /**
   * Handle a Create Bucket Command from the SDK.
   */
  async createBucket(
    command: SimCreateBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimCreateBucketCommandOutput> {
    return await this.commands.createBucket(command, options);
  }

  /**
   * Handle a Put Bucket Policy Command from the SDK.
   */
  async putBucketPolicy(
    command: SimPutBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutBucketPolicyCommandOutput> {
    return await this.commands.putBucketPolicy(command, options);
  }

  /**
   * Handle a Get Bucket Policy Command from the SDK.
   */
  async getBucketPolicy(
    command: SimGetBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetBucketPolicyCommandOutput> {
    return await this.commands.getBucketPolicy(command, options);
  }

  /**
   * Handle a Delete Bucket Policy Command from the SDK.
   */
  async deleteBucketPolicy(
    command: SimDeleteBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimDeleteBucketPolicyCommandOutput> {
    return await this.commands.deleteBucketPolicy(command, options);
  }

  /**
   * Handle a Put Bucket Website Command from the SDK.
   */
  async putBucketWebsite(
    command: SimPutBucketWebsiteCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutBucketWebsiteCommandOutput> {
    return await this.commands.putBucketWebsite(command, options);
  }

  /**
   * Handle a List Buckets Command from the SDK.
   */
  async listBuckets(
    command: SimListBucketsCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimListBucketsCommandOutput> {
    return await this.commands.listBuckets(command, options);
  }

  /**
   * Handle a Put Object Command from the SDK.
   */
  async putObject(
    command: SimPutObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutObjectCommandOutput> {
    return await this.commands.putObject(command, options);
  }

  /**
   * Handle a Get Object Command from the SDK.
   */
  async getObject(
    command: SimGetObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetObjectCommandOutput> {
    return await this.commands.getObject(command, options);
  }

  /**
   * Handle a List Objects Command from the SDK.
   */
  async listObjects(
    command: SimListObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimListObjectsCommandOutput> {
    return await this.commands.listObjects(command, options);
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
