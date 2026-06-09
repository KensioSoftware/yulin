import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutObjectCommand,
  SimPutObjectCommandOutput,
} from "./put-object.cmd.js";
import type {
  SimS3BucketName,
  SimS3Bucket,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3Object, SimS3ObjectMetadata } from "../../object/s3-object.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import { jitter } from "../../../../util/sleep.js";
import { SimS3NoSuchBucket } from "../../error/s3.error.js";

/**
 * Simulated S3 PutObjectCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand/
 */
export class PutObjectCommandHandler implements CommandHandler<
  SimPutObjectCommand,
  SimPutObjectCommandOutput
> {
  constructor(private readonly buckets: Map<SimS3BucketName, SimS3Bucket>) {}

  /**
   * Simulate putting an Object into an S3 Bucket.
   */
  async handle(cmd: SimPutObjectCommand): Promise<SimPutObjectCommandOutput> {
    assertDefined(cmd.input.Bucket, "PutObjectCommand.input.Bucket");
    assertDefined(cmd.input.Key, "PutObjectCommand.input.Key");

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    await jitter();

    const object = new SimS3Object(
      cmd.input.Key,
      PutObjectCommandHandler.toBuffer(cmd.input.Body),
      new SimS3ObjectMetadata(PutObjectCommandHandler.toMetadata(cmd)),
    );
    await bucket.putObject(object);

    return {
      $metadata: {},
    };
  }

  private static toMetadata(cmd: SimPutObjectCommand): Record<string, string> {
    return {
      ...cmd.input.Metadata,
      ...(cmd.input.ContentType === undefined
        ? {}
        : { "content-type": cmd.input.ContentType }),
    };
  }

  private static toBuffer(body: SimPutObjectCommand["input"]["Body"]): Buffer {
    if (body === undefined) {
      return Buffer.alloc(0);
    }

    if (typeof body === "string") {
      return Buffer.from(body);
    }

    if (body instanceof Uint8Array) {
      return Buffer.from(body);
    }

    throw new Error(
      "PutObjectCommand.input.Body must be a string or Uint8Array",
    );
  }
}
