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
import { SimS3PublicAccessBlockAuthorizer } from "../public-access-block/sim-s3-public-access-block-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type {
  SimGetPublicAccessBlockCommand,
  SimGetPublicAccessBlockCommandOutput,
} from "./get-public-access-block.command.js";

interface GetPublicAccessBlockCommandHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 GetPublicAccessBlockCommand handler.
 */
export class GetPublicAccessBlockCommandHandler implements CommandHandler<
  SimGetPublicAccessBlockCommand,
  SimGetPublicAccessBlockCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3PublicAccessBlockAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetPublicAccessBlockCommandHandlerProperties) {
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
   * Authorize and return a Bucket's Block Public Access settings.
   *
   * Every simulated Bucket has settings, so unlike the Bucket policy there is
   * no missing-configuration case to report.
   */
  async handle(
    command: SimGetPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetPublicAccessBlockCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "GetPublicAccessBlockCommand.input.Bucket",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeRead(bucket, options);

    return {
      PublicAccessBlockConfiguration: bucket
        .getPublicAccessBlock()
        .toConfiguration(),
      $metadata: {},
    };
  }
}
