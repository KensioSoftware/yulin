import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimPutBucketWebsiteCommand,
  SimPutBucketWebsiteCommandOutput,
} from "./put-bucket-website.cmd.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3BucketWebsite } from "../../bucket/website/sim-s3-bucket-website.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimS3NoSuchBucket } from "../../error/sim-s3.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimIam } from "../../../iam/index.js";
import { PutBucketWebsiteAuthorizer } from "./put-bucket-website-authorizer.js";

interface PutBucketWebsiteCommandHandlerProps {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface PutBucketWebsiteCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly authorizer: PutBucketWebsiteAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(props: PutBucketWebsiteCommandHandlerProps) {
    const {
      buckets,
      iam = new SimIam(),
      background = new BackgroundTasks(),
    } = props;
    this.buckets = buckets;
    this.authorizer = new PutBucketWebsiteAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Configure static website hosting for an S3 Bucket.
   *
   * Validation and Bucket lookup happen before authorization so malformed
   * commands and missing Buckets retain their existing S3 error behavior.
   * Authorization happens before configureWebsite so denied requests cannot
   * create or replace website state.
   */
  async handle(
    cmd: SimPutBucketWebsiteCommand,
    opts?: PutBucketWebsiteCommandHandlerOptions,
  ): Promise<SimPutBucketWebsiteCommandOutput> {
    assertDefined(
      cmd.input.Bucket,
      "PutBucketWebsiteCommand.input.Bucket required",
    );
    assertDefined(
      cmd.input.WebsiteConfiguration,
      "PutBucketWebsiteCommand.input.WebsiteConfiguration required",
    );

    const bucketName = cmd.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);

    if (bucket === undefined) {
      throw new SimS3NoSuchBucket(`No S3 Bucket named ${bucketName}`);
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(bucketName, opts?.caller);

    bucket.configureWebsite(
      new SimS3BucketWebsite(cmd.input.WebsiteConfiguration),
    );

    return {
      $metadata: {},
    };
  }
}
