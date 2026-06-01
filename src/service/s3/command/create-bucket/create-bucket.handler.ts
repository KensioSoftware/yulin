import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type CreateBucketCommand,
  type CreateBucketCommandOutput,
  BucketAlreadyExists,
} from "@aws-sdk/client-s3";
import { type S3BucketName, SimS3Bucket } from "../../bucket/s3-bucket.js";
import { assertDefined } from "../../../../util/defined.js";
import { jitter } from "../../../../util/sleep.js";

/**
 * S3 CreateBucketCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/CreateBucketCommand/
 */
export class CreateBucketCommandHandler implements CommandHandler<
  CreateBucketCommand,
  CreateBucketCommandOutput
> {
  constructor(private readonly buckets: Map<string, SimS3Bucket>) {}

  /**
   * Handle creation of a new S3 Bucket.
   */
  async handle(cmd: CreateBucketCommand): Promise<CreateBucketCommandOutput> {
    assertDefined(cmd.input.Bucket, "CreateBucketCommand.input.Bucket");

    const bucketName = cmd.input.Bucket as S3BucketName;
    if (this.buckets.has(bucketName)) {
      throw new BucketAlreadyExists({
        message: `S3 Bucket ${bucketName} already exists`,
        $metadata: {},
      });
    }

    await jitter();

    const bucket = new SimS3Bucket(cmd);
    this.buckets.set(bucketName, bucket);

    return {
      BucketArn: `arn:aws:s3:::${bucketName}`,
      Location: `/${bucketName}`,
      $metadata: {},
    };
  }
}
