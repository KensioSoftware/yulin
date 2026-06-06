import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  NoSuchBucket,
  type PutBucketWebsiteCommand,
  type PutBucketWebsiteCommandOutput,
} from "@aws-sdk/client-s3";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { S3BucketWebsite } from "../../bucket/website/s3-bucket-website.js";
import { assertDefined } from "../../../../util/defined.js";
import { jitter } from "../../../../util/sleep.js";

// eslint-disable-next-line no-secrets/no-secrets -- false positive on URL
/**
 * Simulated S3 PutBucketWebsiteCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutBucketWebsiteCommand/
 */
export class PutBucketWebsiteCommandHandler implements CommandHandler<
  PutBucketWebsiteCommand,
  PutBucketWebsiteCommandOutput
> {
  constructor(private readonly buckets: Map<SimS3BucketName, SimS3Bucket>) {}

  /**
   * Configure static website hosting for an S3 Bucket.
   */
  async handle(
    cmd: PutBucketWebsiteCommand,
  ): Promise<PutBucketWebsiteCommandOutput> {
    assertDefined(cmd.input.Bucket, "PutBucketWebsiteCommand.input.Bucket");
    assertDefined(
      cmd.input.WebsiteConfiguration,
      "PutBucketWebsiteCommand.input.WebsiteConfiguration",
    );

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);

    if (bucket === undefined) {
      throw new NoSuchBucket({
        message: `No S3 Bucket named ${bucketName}`,
        $metadata: {},
      });
    }

    await jitter();

    bucket.configureWebsite(
      new S3BucketWebsite(cmd.input.WebsiteConfiguration),
    );

    return {
      $metadata: {},
    };
  }
}
