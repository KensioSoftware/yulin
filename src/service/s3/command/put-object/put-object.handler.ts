import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  NoSuchBucket,
  type PutObjectCommand,
  type PutObjectCommandOutput,
} from "@aws-sdk/client-s3";
import type {
  SimS3BucketName,
  SimS3Bucket,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3Object, SimS3ObjectMetadata } from "../../object/s3-object.js";
import { assertDefined } from "../../../../util/defined.js";
import { jitter } from "../../../../util/sleep.js";

/**
 * Simulated S3 PutObjectCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand/
 */
export class PutObjectCommandHandler implements CommandHandler<
  PutObjectCommand,
  PutObjectCommandOutput
> {
  constructor(private readonly buckets: Map<SimS3BucketName, SimS3Bucket>) {}

  /**
   * Simulate putting an Object into an S3 Bucket.
   */
  async handle(cmd: PutObjectCommand): Promise<PutObjectCommandOutput> {
    assertDefined(cmd.input.Bucket, "PutObjectCommand.input.Bucket");
    assertDefined(cmd.input.Key, "PutObjectCommand.input.Key");

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new NoSuchBucket({
        message: `No S3 Bucket named ${bucketName}`,
        $metadata: {},
      });
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

  private static toMetadata(cmd: PutObjectCommand): Record<string, string> {
    return {
      ...cmd.input.Metadata,
      ...(cmd.input.ContentType === undefined
        ? {}
        : { "content-type": cmd.input.ContentType }),
    };
  }

  private static toBuffer(body: PutObjectCommand["input"]["Body"]): Buffer {
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
