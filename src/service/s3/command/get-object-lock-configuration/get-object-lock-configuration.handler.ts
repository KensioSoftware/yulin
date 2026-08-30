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
import { SimS3ObjectLockConfigurationNotFound } from "../../error/sim-s3-object-lock.error.js";
import { SimS3ObjectLockAuthorizer } from "../object-lock/sim-s3-object-lock-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";
import type {
  SimGetObjectLockConfigurationCommand,
  SimGetObjectLockConfigurationCommandOutput,
} from "./get-object-lock-configuration.command.js";

interface GetObjectLockConfigurationHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated S3 GetObjectLockConfigurationCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetObjectLockConfigurationCommand/
 */
export class GetObjectLockConfigurationCommandHandler implements CommandHandler<
  SimGetObjectLockConfigurationCommand,
  SimGetObjectLockConfigurationCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3ObjectLockAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetObjectLockConfigurationHandlerProperties) {
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
   * Report how a Bucket is locked.
   *
   * A Bucket that has never had Object Lock is answered with
   * `ObjectLockConfigurationNotFoundError`, as real S3 answers one, rather
   * than with a configuration saying it is off.
   */
  async handle(
    command: SimGetObjectLockConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimGetObjectLockConfigurationCommandOutput> {
    const { Bucket } = command.input;
    assertDefined(Bucket, "GetObjectLockConfigurationCommand.input.Bucket");

    const bucket = requireSimS3Bucket(this.buckets, Bucket as SimS3BucketName);

    await this.background.sequence();

    this.authorizer.authorizeReadConfiguration(bucket, options);

    const configuration = bucket.getObjectLock().configuration;

    if (configuration === undefined) {
      throw new SimS3ObjectLockConfigurationNotFound(
        `S3 Bucket ${Bucket} does not have an Object Lock configuration`,
      );
    }

    return { ObjectLockConfiguration: configuration.reported, $metadata: {} };
  }
}
