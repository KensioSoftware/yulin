import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type CreateBucketCommand,
  type CreateBucketCommandOutput,
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
} from "@aws-sdk/client-s3";
import { type SimS3BucketName, SimS3Bucket } from "../../bucket/s3-bucket.js";
import { assertDefined } from "../../../../util/defined.js";
import { jitter } from "../../../../util/sleep.js";
import type { SimS3GlobalRegistry } from "../../sim-s3-global-registry.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";

/**
 * S3 CreateBucketCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/CreateBucketCommand/
 */
export class CreateBucketCommandHandler implements CommandHandler<
  CreateBucketCommand,
  CreateBucketCommandOutput
> {
  constructor(
    private readonly accountRegionScope: SimAwsAccountRegionScope,
    private readonly buckets: Map<string, SimS3Bucket>,
    private readonly s3GlobalRegistry: SimS3GlobalRegistry,
  ) {}

  /**
   * Handle creation of a new S3 Bucket.
   */
  async handle(cmd: CreateBucketCommand): Promise<CreateBucketCommandOutput> {
    assertDefined(cmd.input.Bucket, "CreateBucketCommand.input.Bucket");

    await jitter();

    const bucketName = cmd.input.Bucket as SimS3BucketName;

    const existingBucketScope =
      this.s3GlobalRegistry.findBucketScope(bucketName);
    if (existingBucketScope !== undefined) {
      if (existingBucketScope.accountId === this.accountRegionScope.accountId) {
        throw new BucketAlreadyOwnedByYou({
          message: `S3 Bucket ${bucketName} already exists in ${existingBucketScope.regionName} and is owned by ${existingBucketScope.accountId}`,
          $metadata: {},
        });
      }
      throw new BucketAlreadyExists({
        message: `S3 Bucket ${bucketName} already exists in ${existingBucketScope.regionName} ${existingBucketScope.accountId}`,
        $metadata: {},
      });
    }

    /* v8 ignore if -- safety catch for situation that cannot happen in normal usage */
    if (this.buckets.has(bucketName)) {
      // Somehow the Bucket was absent from the global registry.
      this.s3GlobalRegistry.registerBucket(bucketName, this.accountRegionScope);
      throw new BucketAlreadyOwnedByYou({
        message: `S3 Bucket ${bucketName} already exists in ${this.accountRegionScope.regionName} and is owned by ${this.accountRegionScope.accountId}`,
        $metadata: {},
      });
    }

    const bucket = new SimS3Bucket(cmd);
    this.buckets.set(bucketName, bucket);
    this.s3GlobalRegistry.registerBucket(bucketName, this.accountRegionScope);

    return {
      BucketArn: `arn:aws:s3:::${bucketName}`,
      Location: `/${bucketName}`,
      $metadata: {},
    };
  }
}
