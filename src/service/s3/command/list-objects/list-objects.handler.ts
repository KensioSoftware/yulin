import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimListObjectsCommand,
  SimListObjectsCommandOutput,
} from "./list-objects.cmd.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimS3NoSuchBucket } from "../../error/sim-s3.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";

interface ListObjectsCommandHandlerProps {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 ListObjectsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListObjectsCommand/
 */
export class ListObjectsCommandHandler implements CommandHandler<
  SimListObjectsCommand,
  SimListObjectsCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly background: BackgroundScheduler;

  constructor(props: ListObjectsCommandHandlerProps) {
    const { buckets, background = new BackgroundTasks() } = props;
    this.buckets = buckets;
    this.background = background;
  }

  /**
   * Simulate listing Objects in an S3 Bucket.
   */
  async handle(
    cmd: SimListObjectsCommand,
  ): Promise<SimListObjectsCommandOutput> {
    assertDefined(cmd.input.Bucket, "ListObjectsCommand.input.Bucket");

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

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
