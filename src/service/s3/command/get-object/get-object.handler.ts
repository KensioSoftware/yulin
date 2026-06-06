import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  NoSuchBucket,
  NoSuchKey,
  type GetObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import type {
  SimS3BucketName,
  SimS3Bucket,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/defined.js";
import { jitter } from "../../../../util/sleep.js";

/**
 * Simulated S3 GetObjectCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetObjectCommand/
 */
export class GetObjectCommandHandler implements CommandHandler<
  GetObjectCommand,
  GetObjectCommandOutput
> {
  constructor(private readonly buckets: Map<SimS3BucketName, SimS3Bucket>) {}

  /**
   * Simulate getting an Object from an S3 Bucket.
   */
  async handle(cmd: GetObjectCommand): Promise<GetObjectCommandOutput> {
    assertDefined(cmd.input.Bucket, "GetObjectCommand.input.Bucket");
    assertDefined(cmd.input.Key, "GetObjectCommand.input.Key");

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new NoSuchBucket({
        message: `No S3 Bucket named ${bucketName}`,
        $metadata: {},
      });
    }

    await jitter();

    const object = await bucket.getObject(cmd.input.Key);
    if (object === undefined) {
      throw new NoSuchKey({
        message: `No S3 Object named ${cmd.input.Key}`,
        $metadata: {},
      });
    }

    return {
      Body: Readable.from([object.body]) as NonNullable<
        GetObjectCommandOutput["Body"]
      >,
      Metadata: object.metadata.values,
      $metadata: {},
    };
  }
}
