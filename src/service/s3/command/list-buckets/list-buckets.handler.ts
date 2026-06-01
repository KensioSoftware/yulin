import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  ListBucketsCommand,
  ListBucketsCommandOutput,
} from "@aws-sdk/client-s3";
import type { S3BucketName, SimS3Bucket } from "../../bucket/s3-bucket.js";
import { jitter } from "../../../../util/sleep.js";

/**
 * Simulated S3 ListBucketsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/ListBucketsCommand/
 */
export class ListBucketsCommandHandler implements CommandHandler<
  ListBucketsCommand,
  ListBucketsCommandOutput
> {
  constructor(private readonly buckets: Map<S3BucketName, SimS3Bucket>) {}

  /**
   * Simulate listing S3 Buckets.
   */
  async handle(cmd: ListBucketsCommand): Promise<ListBucketsCommandOutput> {
    await jitter();

    const buckets = [...this.buckets.values()];
    buckets.sort((a, b) => a.bucketName.localeCompare(b.bucketName));

    const prefix = cmd.input.Prefix;
    const continuationToken = cmd.input.ContinuationToken;
    const maxBuckets = cmd.input.MaxBuckets ?? 10_000;

    const matchingBuckets =
      prefix === undefined
        ? buckets
        : buckets.filter((bucket) => bucket.bucketName.startsWith(prefix));

    const startBucketName =
      continuationToken === undefined
        ? undefined
        : ListBucketsCommandHandler.parseContinuationToken(continuationToken);

    const startIndex =
      startBucketName === undefined
        ? 0
        : Math.max(
            0,
            matchingBuckets.findIndex(
              (bucket) => bucket.bucketName === startBucketName,
            ) + 1,
          );

    const page = matchingBuckets.slice(startIndex, startIndex + maxBuckets);
    const lastBucket = page.at(-1);
    const hasMoreBuckets = startIndex + page.length < matchingBuckets.length;

    return {
      Buckets: page.map((bucket) => ({
        Name: bucket.bucketName,
      })),
      ContinuationToken:
        hasMoreBuckets && lastBucket !== undefined
          ? ListBucketsCommandHandler.makeContinuationToken(
              lastBucket.bucketName,
            )
          : undefined,
      Prefix: prefix,
      $metadata: {},
    };
  }

  private static makeContinuationToken(bucketName: string): string {
    return Buffer.from(bucketName, "utf8").toString("base64url");
  }

  private static parseContinuationToken(token: string): string {
    return Buffer.from(token, "base64url").toString("utf8");
  }
}
