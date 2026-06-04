import type { SimS3BucketName, SimS3Bucket } from "./bucket/s3-bucket.js";
import type {
  CreateBucketCommand,
  CreateBucketCommandOutput,
  GetObjectCommand,
  GetObjectCommandOutput,
  ListBucketsCommand,
  ListBucketsCommandOutput,
  ListObjectsCommand,
  ListObjectsCommandOutput,
  PutObjectCommand,
  PutObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { CreateBucketCommandHandler } from "./command/create-bucket/create-bucket.handler.js";
import { ListBucketsCommandHandler } from "./command/list-buckets/list-buckets.handler.js";
import { assertDefined } from "../../util/defined.js";
import { PutObjectCommandHandler } from "./command/put-object/put-object.handler.js";
import { GetObjectCommandHandler } from "./command/get-object/get-object.handler.js";
import { ListObjectsCommandHandler } from "./command/list-objects/list-objects.handler.js";
import { SimS3GlobalRegistry } from "./sim-s3-global-registry.js";
import {
  type SimAwsAccountRegionScope,
  simAwsAccountRegionScopeFactory,
} from "../aws/sim-aws-account-region-scope.js";

/**
 * Simulated S3. Handles SDK commands. Emulates AWS behaviour and state.
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
  getSimBucketByName(bucketName: SimS3BucketName): SimS3Bucket {
    const simBucket = this.buckets.get(bucketName);
    assertDefined(simBucket, `Simulated S3 Bucket named '${bucketName}'`);
    return simBucket;
  }
}
