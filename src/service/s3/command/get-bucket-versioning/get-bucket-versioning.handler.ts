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
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { SimS3VersioningAuthorizer } from "../versioning/sim-s3-versioning-authorizer.js";
import type {
  SimGetBucketVersioningCommand,
  SimGetBucketVersioningCommandOutput,
} from "./get-bucket-versioning.command.js";

interface GetBucketVersioningHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 GetBucketVersioningCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetBucketVersioningCommand/
 */
export class GetBucketVersioningCommandHandler implements CommandHandler<
  SimGetBucketVersioningCommand,
  SimGetBucketVersioningCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3VersioningAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetBucketVersioningHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3VersioningAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and report how a Bucket is versioned.
   *
   * A Bucket nobody has configured answers with an empty response rather than
   * an error, which is how real S3 reports one and what distinguishes it from
   * a Bucket whose versioning was suspended.
   */
  async handle(
    command: SimGetBucketVersioningCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetBucketVersioningCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "GetBucketVersioningCommand.input.Bucket",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeRead(bucket, options);

    const status = bucket.getVersions().configuration.status;

    return {
      ...(status !== undefined && { Status: status }),
      $metadata: {},
    };
  }
}
