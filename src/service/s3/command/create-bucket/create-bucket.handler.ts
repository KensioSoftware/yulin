import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCreateBucketCommand,
  SimCreateBucketCommandOutput,
} from "./create-bucket.cmd.js";
import {
  SimS3Bucket,
  type SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimS3GlobalRegistry } from "../../sim-s3-global-registry.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { SimS3BucketNameAvailability } from "../../bucket/name-availability/sim-s3-bucket-name-availability.js";

interface CreateBucketCommandHandlerProps {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly buckets: Map<string, SimS3Bucket>;
  readonly s3GlobalRegistry: SimS3GlobalRegistry;
  readonly background?: BackgroundScheduler;
}

/**
 * S3 CreateBucketCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/CreateBucketCommand/
 */
export class CreateBucketCommandHandler implements CommandHandler<
  SimCreateBucketCommand,
  SimCreateBucketCommandOutput
> {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly buckets: Map<string, SimS3Bucket>;
  private readonly s3GlobalRegistry: SimS3GlobalRegistry;
  private readonly background: BackgroundScheduler;

  constructor(props: CreateBucketCommandHandlerProps) {
    const {
      accountRegionScope,
      buckets,
      s3GlobalRegistry,
      background = new BackgroundTasks(),
    } = props;
    this.accountRegionScope = accountRegionScope;
    this.buckets = buckets;
    this.s3GlobalRegistry = s3GlobalRegistry;
    this.background = background;
  }

  /**
   * Handle creation of a new S3 Bucket.
   */
  async handle(
    cmd: SimCreateBucketCommand,
  ): Promise<SimCreateBucketCommandOutput> {
    assertDefined(cmd.input.Bucket, "CreateBucketCommand.input.Bucket");

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const bucketName = cmd.input.Bucket as SimS3BucketName;

    new SimS3BucketNameAvailability({
      accountRegionScope: this.accountRegionScope,
      buckets: this.buckets,
      s3GlobalRegistry: this.s3GlobalRegistry,
    }).ensureCanCreateBucketNamed(bucketName);

    const bucket = new SimS3Bucket({
      bucketName,
      accountRegionScope: this.accountRegionScope,
    });
    this.buckets.set(bucketName, bucket);
    this.s3GlobalRegistry.registerBucket(bucketName, this.accountRegionScope);

    return {
      BucketArn: `arn:aws:s3:::${bucketName}`,
      Location: `/${bucketName}`,
      $metadata: {},
    };
  }
}
