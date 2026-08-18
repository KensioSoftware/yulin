import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3NotFound } from "../../error/sim-s3.error.js";
import { HeadBucketAuthorizer } from "./head-bucket-authorizer.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimHeadBucketCommand,
  SimHeadBucketCommandOutput,
} from "./head-bucket.command.js";

interface HeadBucketCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 HeadBucketCommand handler.
 *
 * Real S3 authorizes this against `s3:ListBucket`, the same permission a
 * listing needs, because knowing a Bucket is there is the same knowledge a
 * listing would give away.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/HeadBucketCommand/
 */
export class HeadBucketCommandHandler implements CommandHandler<
  SimHeadBucketCommand,
  SimHeadBucketCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly authorizer: HeadBucketAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: HeadBucketCommandHandlerProperties) {
    const {
      buckets,
      accountRegionScope,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.buckets = buckets;
    this.accountRegionScope = accountRegionScope;
    this.authorizer = new HeadBucketAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Report whether the Bucket is there and the caller may reach it.
   */
  async handle(
    command: SimHeadBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimHeadBucketCommandOutput> {
    assertDefined(command.input.Bucket, "HeadBucketCommand.input.Bucket");

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = this.buckets.get(bucketName);
    if (bucket === undefined) {
      throw new SimS3NotFound(`No S3 Bucket named ${bucketName}`);
    }

    await this.background.sequence();

    this.authorizer.authorize(bucket, options);

    return {
      BucketRegion: this.accountRegionScope.regionName,
      $metadata: {},
    };
  }
}
