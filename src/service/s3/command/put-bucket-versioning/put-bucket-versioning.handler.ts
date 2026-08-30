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
import { SimS3BucketVersioning } from "../../bucket/versioning/sim-s3-bucket-versioning.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import { SimS3VersioningAuthorizer } from "../versioning/sim-s3-versioning-authorizer.js";
import { validateSimS3VersioningConfiguration } from "../versioning/sim-s3-versioning-configuration-validation.js";
import type {
  SimPutBucketVersioningCommand,
  SimPutBucketVersioningCommandOutput,
} from "./put-bucket-versioning.command.js";

interface PutBucketVersioningHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 PutBucketVersioningCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutBucketVersioningCommand/
 */
export class PutBucketVersioningCommandHandler implements CommandHandler<
  SimPutBucketVersioningCommand,
  SimPutBucketVersioningCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3VersioningAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: PutBucketVersioningHandlerProperties) {
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
   * Authorize and apply a Bucket's versioning configuration.
   *
   * Enabling versioning over a Bucket that already holds Objects gives each of
   * them the null version id, which is what real S3 does with the Objects
   * written before the configuration arrived.
   */
  async handle(
    command: SimPutBucketVersioningCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutBucketVersioningCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "PutBucketVersioningCommand.input.Bucket",
    );
    assertDefined(
      command.input.VersioningConfiguration,
      "PutBucketVersioningCommand.input.VersioningConfiguration",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeWrite(bucket, options);

    const configuration = command.input.VersioningConfiguration;
    validateSimS3VersioningConfiguration(configuration, bucketName);

    await bucket.configureVersioning(
      SimS3BucketVersioning.fromConfiguration(configuration),
    );

    return {
      $metadata: {},
    };
  }
}
