import type { SimS3Bucket, SimS3BucketName } from "./bucket/s3-bucket.js";
import type {
  CreateBucketCommand,
  CreateBucketCommandOutput,
  GetObjectCommand,
  GetObjectCommandOutput,
  ListBucketsCommand,
  ListBucketsCommandOutput,
  ListObjectsCommand,
  ListObjectsCommandOutput,
  PutBucketWebsiteCommand,
  PutBucketWebsiteCommandOutput,
  PutObjectCommand,
  PutObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { CreateBucketCommandHandler } from "./command/create-bucket/create-bucket.handler.js";
import { ListBucketsCommandHandler } from "./command/list-buckets/list-buckets.handler.js";
import { PutObjectCommandHandler } from "./command/put-object/put-object.handler.js";
import { GetObjectCommandHandler } from "./command/get-object/get-object.handler.js";
import { ListObjectsCommandHandler } from "./command/list-objects/list-objects.handler.js";
import { SimS3GlobalRegistry } from "./sim-s3-global-registry.js";
import {
  type SimAwsAccountRegionScope,
  simAwsAccountRegionScopeFactory,
} from "../aws/sim-aws-account-region-scope.js";
import { PutBucketWebsiteCommandHandler } from "./command/put-bucket-website/put-bucket-website.handler.js";
import { assertDefined } from "../../util/defined.js";
import { FilesystemS3BucketStorage } from "./storage/s3-filesystem-storage.js";

/**
 * Simulated S3. Handles SDK commands. Emulates AWS behaviour and state.
 * Scoped to an Account and Region, but has access to a global (as in
 * cross-region) registry of simulated S3 Buckets.
 */
export class SimS3 {
  private readonly buckets = new Map<SimS3BucketName, SimS3Bucket>();

  constructor(
    private readonly accountRegionScope: SimAwsAccountRegionScope = simAwsAccountRegionScopeFactory.make(),
    private readonly s3GlobalRegistry: SimS3GlobalRegistry = new SimS3GlobalRegistry(),
  ) {}

  /**
   * Handle a Create Bucket Command from the SDK.
   */
  async createBucket(
    cmd: CreateBucketCommand,
  ): Promise<CreateBucketCommandOutput> {
    const handler = new CreateBucketCommandHandler(
      this.accountRegionScope,
      this.buckets,
      this.s3GlobalRegistry,
    );
    return await handler.handle(cmd);
  }

  /**
   * Handle a Put Bucket Website Command from the SDK.
   */
  async putBucketWebsite(
    cmd: PutBucketWebsiteCommand,
  ): Promise<PutBucketWebsiteCommandOutput> {
    const handler = new PutBucketWebsiteCommandHandler(this.buckets);
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Buckets Command from the SDK.
   */
  async listBuckets(
    cmd: ListBucketsCommand,
  ): Promise<ListBucketsCommandOutput> {
    const handler = new ListBucketsCommandHandler(this.buckets);
    return await handler.handle(cmd);
  }

  /**
   * Handle a Put Object Command from the SDK.
   */
  async putObject(cmd: PutObjectCommand): Promise<PutObjectCommandOutput> {
    const handler = new PutObjectCommandHandler(this.buckets);
    return await handler.handle(cmd);
  }

  /**
   * Handle a Get Object Command from the SDK.
   */
  async getObject(cmd: GetObjectCommand): Promise<GetObjectCommandOutput> {
    const handler = new GetObjectCommandHandler(this.buckets);
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Objects Command from the SDK.
   */
  async listObjects(
    cmd: ListObjectsCommand,
  ): Promise<ListObjectsCommandOutput> {
    const handler = new ListObjectsCommandHandler(this.buckets);
    return await handler.handle(cmd);
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
    bucket.configureSimStorage(new FilesystemS3BucketStorage(directoryPath));
  }
}
