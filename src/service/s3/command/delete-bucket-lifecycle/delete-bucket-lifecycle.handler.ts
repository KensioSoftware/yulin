import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAllowAllAuth } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3LifecycleAuthorizer } from "../lifecycle/sim-s3-lifecycle-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type {
  SimDeleteBucketLifecycleCommand,
  SimDeleteBucketLifecycleCommandOutput,
} from "./delete-bucket-lifecycle.command.js";

interface DeleteBucketLifecycleHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 DeleteBucketLifecycleCommand handler.
 */
export class DeleteBucketLifecycleCommandHandler implements CommandHandler<
  SimDeleteBucketLifecycleCommand,
  SimDeleteBucketLifecycleCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3LifecycleAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteBucketLifecycleHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3LifecycleAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and remove a Bucket's lifecycle rules.
   *
   * Real S3 DeleteBucketLifecycle is idempotent, so a Bucket that had no rules
   * to remove is answered the same way as one that did.
   */
  async handle(
    command: SimDeleteBucketLifecycleCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimDeleteBucketLifecycleCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "DeleteBucketLifecycleCommand.input.Bucket",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeWrite(bucket, options);

    bucket.deleteLifecycle();

    return {
      $metadata: {},
    };
  }
}
