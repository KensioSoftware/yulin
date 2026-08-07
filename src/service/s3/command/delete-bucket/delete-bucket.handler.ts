import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3BucketNotEmpty } from "../../error/sim-s3.error.js";
import type { SimS3GlobalRegistry } from "../../sim-s3-global-registry.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import { DeleteBucketAuthorizer } from "./delete-bucket-authorizer.js";
import type {
  SimDeleteBucketCommand,
  SimDeleteBucketCommandOutput,
} from "./delete-bucket.command.js";

interface DeleteBucketCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly s3GlobalRegistry: SimS3GlobalRegistry;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 DeleteBucketCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/DeleteBucketCommand/
 */
export class DeleteBucketCommandHandler implements CommandHandler<
  SimDeleteBucketCommand,
  SimDeleteBucketCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly s3GlobalRegistry: SimS3GlobalRegistry;
  private readonly authorizer: DeleteBucketAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteBucketCommandHandlerProperties) {
    const {
      buckets,
      s3GlobalRegistry,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.s3GlobalRegistry = s3GlobalRegistry;
    this.authorizer = new DeleteBucketAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and delete a Bucket.
   *
   * Real S3 only deletes an empty Bucket, and answers BucketNotEmpty otherwise
   * rather than removing the Objects for the caller. That refusal is the reason
   * a CloudFormation Stack holding a Bucket with Objects in it fails to delete,
   * so it is worth keeping here.
   *
   * The Bucket name is released globally as well as in this scope, because S3
   * Bucket names are globally unique and a deleted name can be claimed again.
   */
  async handle(
    command: SimDeleteBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimDeleteBucketCommandOutput> {
    assertDefined(command.input.Bucket, "DeleteBucketCommand.input.Bucket");

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorize(bucket, options);
    await this.assertEmpty(bucket);

    this.buckets.delete(bucketName);
    this.s3GlobalRegistry.deregisterBucket(bucketName);

    return {
      $metadata: {},
    };
  }

  private async assertEmpty(bucket: SimS3Bucket): Promise<void> {
    const objects = await bucket.listObjects();

    if (objects.length > 0) {
      throw new SimS3BucketNotEmpty(
        `S3 Bucket ${bucket.bucketName} holds ${String(objects.length)} Objects`,
      );
    }
  }
}
