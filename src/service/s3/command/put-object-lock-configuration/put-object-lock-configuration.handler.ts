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
import { SimS3ObjectLockConfiguration } from "../../bucket/lock/sim-s3-object-lock-configuration.js";
import { SimS3InvalidBucketState } from "../../error/sim-s3-object-lock.error.js";
import { SimS3ObjectLockAuthorizer } from "../object-lock/sim-s3-object-lock-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimPutObjectLockConfigurationCommand,
  SimPutObjectLockConfigurationCommandOutput,
} from "./put-object-lock-configuration.command.js";

interface PutObjectLockConfigurationHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 PutObjectLockConfigurationCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectLockConfigurationCommand/
 */
export class PutObjectLockConfigurationCommandHandler implements CommandHandler<
  SimPutObjectLockConfigurationCommand,
  SimPutObjectLockConfigurationCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3ObjectLockAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: PutObjectLockConfigurationHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3ObjectLockAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Authorize and apply a Bucket's Object Lock configuration.
   *
   * Object Lock protects a version and has no meaning without one, so a Bucket
   * that keeps none is refused. Real S3 requires versioning underneath it for
   * the same reason, and a Bucket that appeared to accept the configuration
   * would report a retention nothing was enforcing.
   */
  async handle(
    command: SimPutObjectLockConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutObjectLockConfigurationCommandOutput> {
    const { Bucket, ObjectLockConfiguration } = command.input;
    assertDefined(Bucket, "PutObjectLockConfigurationCommand.input.Bucket");
    assertDefined(
      ObjectLockConfiguration,
      "PutObjectLockConfigurationCommand.input.ObjectLockConfiguration",
    );

    const bucket = requireSimS3Bucket(this.buckets, Bucket as SimS3BucketName);

    await this.background.sequence();

    this.authorizer.authorizeWriteConfiguration(bucket, options);

    if (!bucket.getVersions().configuration.isEnabled) {
      throw new SimS3InvalidBucketState(
        `Object Lock cannot be enabled on Bucket ${Bucket}, which does not ` +
          `have versioning enabled`,
      );
    }

    bucket
      .getObjectLock()
      .configure(SimS3ObjectLockConfiguration.parse(ObjectLockConfiguration));

    return { $metadata: {} };
  }
}
