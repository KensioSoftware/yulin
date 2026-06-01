import type { S3BucketName, SimS3Bucket } from "./bucket/s3-bucket.js";
import type {
  CreateBucketCommand,
  CreateBucketCommandOutput,
  ListBucketsCommand,
  ListBucketsCommandOutput,
} from "@aws-sdk/client-s3";
import { CreateBucketCommandHandler } from "./command/create-bucket/create-bucket.handler.js";
import { ListBucketsCommandHandler } from "./command/list-buckets/list-buckets.handler.js";

/**
 * Simulated S3. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimS3 {
  private readonly buckets = new Map<S3BucketName, SimS3Bucket>();

  /**
   * Handle a Create Bucket Command from the SDK.
   */
  async createBucket(
    cmd: CreateBucketCommand,
  ): Promise<CreateBucketCommandOutput> {
    const handler = new CreateBucketCommandHandler(this.buckets);
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
}
