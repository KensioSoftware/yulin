import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCreateBucketCommand,
  SimCreateBucketCommandOutput,
} from "./create-bucket.cmd.js";
import {
  SimS3Bucket,
  type SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import { jitter } from "../../../../util/sleep.js";
import type { SimS3GlobalRegistry } from "../../sim-s3-global-registry.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimS3BucketAlreadyExists,
  SimS3BucketAlreadyOwnedByYou,
} from "../../error/s3.error.js";

interface CreateBucketCommandHandlerProps {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly buckets: Map<string, SimS3Bucket>;
  readonly s3GlobalRegistry: SimS3GlobalRegistry;
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

  constructor(props: CreateBucketCommandHandlerProps) {
    this.accountRegionScope = props.accountRegionScope;
    this.buckets = props.buckets;
    this.s3GlobalRegistry = props.s3GlobalRegistry;
  }

  /**
   * Handle creation of a new S3 Bucket.
   */
  async handle(
    cmd: SimCreateBucketCommand,
  ): Promise<SimCreateBucketCommandOutput> {
    assertDefined(cmd.input.Bucket, "CreateBucketCommand.input.Bucket");

    await jitter();

    const bucketName = cmd.input.Bucket as SimS3BucketName;

    const existingBucketScope =
      this.s3GlobalRegistry.findBucketScope(bucketName);
    if (existingBucketScope !== undefined) {
      if (existingBucketScope.accountId === this.accountRegionScope.accountId) {
        throw new SimS3BucketAlreadyOwnedByYou(
          `S3 Bucket ${bucketName} already exists in ${existingBucketScope.regionName} and is owned by ${existingBucketScope.accountId}`,
        );
      }
      throw new SimS3BucketAlreadyExists(
        `S3 Bucket ${bucketName} already exists in ${existingBucketScope.regionName} ${existingBucketScope.accountId}`,
      );
    }

    /* v8 ignore if -- safety catch for situation that cannot happen in normal usage */
    if (this.buckets.has(bucketName)) {
      // Somehow the Bucket was absent from the global registry.
      this.s3GlobalRegistry.registerBucket(bucketName, this.accountRegionScope);
      throw new SimS3BucketAlreadyOwnedByYou(
        `S3 Bucket ${bucketName} already exists in ${this.accountRegionScope.regionName} and is owned by ${this.accountRegionScope.accountId}`,
      );
    }

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
