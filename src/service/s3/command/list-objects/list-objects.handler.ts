import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  NoSuchBucket,
  type ListObjectsCommand,
  type ListObjectsCommandOutput,
} from "@aws-sdk/client-s3";
import type {
  SimS3BucketName,
  SimS3Bucket,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/defined.js";
import { jitter } from "../../../../util/sleep.js";

/**
 * Simulated S3 ListObjectsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListObjectsCommand/
 */
export class ListObjectsCommandHandler implements CommandHandler<
  ListObjectsCommand,
  ListObjectsCommandOutput
> {
  constructor(private readonly buckets: Map<SimS3BucketName, SimS3Bucket>) {}

  /**
   * Simulate listing Objects in an S3 Bucket.
   */
  async handle(cmd: ListObjectsCommand): Promise<ListObjectsCommandOutput> {
    assertDefined(cmd.input.Bucket, "ListObjectsCommand.input.Bucket");

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new NoSuchBucket({
        message: `No S3 Bucket named ${bucketName}`,
        $metadata: {},
      });
    }

    await jitter();

    const prefix = cmd.input.Prefix;
    const marker = cmd.input.Marker;
    const maxKeys = cmd.input.MaxKeys ?? 1000;

    const objects = await bucket.listObjects(prefix);
    objects.sort((a, b) => a.key.localeCompare(b.key));

    const startIndex =
      marker === undefined
        ? 0
        : Math.max(0, objects.findIndex((object) => object.key === marker) + 1);

    const page = objects.slice(startIndex, startIndex + maxKeys);
    const lastObject = page.at(-1);
    const isTruncated = startIndex + page.length < objects.length;

    return {
      Contents: page.map((object) => ({
        Key: object.key,
        Size: object.body.length,
      })),
      Name: bucket.bucketName,
      Prefix: prefix,
      Marker: marker,
      MaxKeys: maxKeys,
      IsTruncated: isTruncated,
      NextMarker:
        isTruncated && lastObject !== undefined ? lastObject.key : undefined,
      $metadata: {},
    };
  }
}
