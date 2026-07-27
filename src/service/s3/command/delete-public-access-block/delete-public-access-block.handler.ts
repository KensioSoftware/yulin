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
import { SimS3PublicAccessBlockAuthorizer } from "../public-access-block/sim-s3-public-access-block-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type {
  SimDeletePublicAccessBlockCommand,
  SimDeletePublicAccessBlockCommandOutput,
} from "./delete-public-access-block.command.js";

interface DeletePublicAccessBlockCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DeletePublicAccessBlockCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated S3 DeletePublicAccessBlockCommand handler.
 */
export class DeletePublicAccessBlockCommandHandler implements CommandHandler<
  SimDeletePublicAccessBlockCommand,
  SimDeletePublicAccessBlockCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3PublicAccessBlockAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeletePublicAccessBlockCommandHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3PublicAccessBlockAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and remove a Bucket's Block Public Access settings, returning
   * the Bucket to the all-enabled state a new Bucket starts in.
   */
  async handle(
    command: SimDeletePublicAccessBlockCommand,
    options?: DeletePublicAccessBlockCommandHandlerOptions,
  ): Promise<SimDeletePublicAccessBlockCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "DeletePublicAccessBlockCommand.input.Bucket",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeWrite(bucket, options?.caller);

    bucket.deletePublicAccessBlock();

    return {
      $metadata: {},
    };
  }
}
