import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimGetObjectCommand,
  SimGetObjectCommandOutput,
} from "./get-object.cmd.js";
import { Readable } from "node:stream";
import type {
  SimS3BucketName,
  SimS3Bucket,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import { jitter } from "../../../../util/sleep.js";
import { SimS3NoSuchBucket, SimS3NoSuchKey } from "../../error/s3.error.js";

/**
 * Simulated S3 GetObjectCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetObjectCommand/
 */
export class GetObjectCommandHandler implements CommandHandler<
  SimGetObjectCommand,
  SimGetObjectCommandOutput
> {
  constructor(private readonly buckets: Map<SimS3BucketName, SimS3Bucket>) {}

  /**
   * Simulate getting an Object from an S3 Bucket.
   */
  async handle(cmd: SimGetObjectCommand): Promise<SimGetObjectCommandOutput> {
    assertDefined(cmd.input.Bucket, "GetObjectCommand.input.Bucket");
    assertDefined(cmd.input.Key, "GetObjectCommand.input.Key");

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    await jitter();

    const object = await bucket.getObject(cmd.input.Key);
    if (object === undefined) {
      throw new SimS3NoSuchKey(`No S3 Object named ${cmd.input.Key}`);
    }

    return {
      Body: Readable.from([object.body]),
      Metadata: object.metadata.values,
      $metadata: {},
    };
  }
}
