import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutBucketWebsiteCommand,
  SimPutBucketWebsiteCommandOutput,
} from "./put-bucket-website.cmd.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { S3BucketWebsite } from "../../bucket/website/s3-bucket-website.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import { SimS3NoSuchBucket } from "../../error/s3.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";

interface PutBucketWebsiteCommandHandlerProps {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 PutBucketWebsiteCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutBucketWebsiteCommand/
 */
export class PutBucketWebsiteCommandHandler implements CommandHandler<
  SimPutBucketWebsiteCommand,
  SimPutBucketWebsiteCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly background: BackgroundScheduler;

  constructor(props: PutBucketWebsiteCommandHandlerProps) {
    const { buckets, background = new BackgroundTasks() } = props;
    this.buckets = buckets;
    this.background = background;
  }

  /**
   * Configure static website hosting for an S3 Bucket.
   */
  async handle(
    cmd: SimPutBucketWebsiteCommand,
  ): Promise<SimPutBucketWebsiteCommandOutput> {
    assertDefined(cmd.input.Bucket, "PutBucketWebsiteCommand.input.Bucket");
    assertDefined(
      cmd.input.WebsiteConfiguration,
      "PutBucketWebsiteCommand.input.WebsiteConfiguration",
    );

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);

    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    bucket.configureWebsite(
      new S3BucketWebsite(cmd.input.WebsiteConfiguration),
    );

    return {
      $metadata: {},
    };
  }
}
