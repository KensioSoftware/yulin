import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAllowAllAuth } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import { DeleteBucketPolicyAuthorizer } from "./delete-bucket-policy-authorizer.js";
import type {
  SimDeleteBucketPolicyCommand,
  SimDeleteBucketPolicyCommandOutput,
} from "./delete-bucket-policy.command.js";

interface DeleteBucketPolicyCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DeleteBucketPolicyCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated S3 DeleteBucketPolicyCommand handler.
 */
export class DeleteBucketPolicyCommandHandler implements CommandHandler<
  SimDeleteBucketPolicyCommand,
  SimDeleteBucketPolicyCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: DeleteBucketPolicyAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteBucketPolicyCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new DeleteBucketPolicyAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and remove a Bucket's resource policy.
   *
   * Real S3 answers the same way whether or not there was a policy to remove,
   * so a Bucket without one is not an error here.
   */
  async handle(
    command: SimDeleteBucketPolicyCommand,
    options?: DeleteBucketPolicyCommandHandlerOptions,
  ): Promise<SimDeleteBucketPolicyCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "DeleteBucketPolicyCommand.input.Bucket",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorize(bucket, options?.caller);

    bucket.deletePolicy();

    return {
      $metadata: {},
    };
  }
}
