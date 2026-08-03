import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3NotificationAuthorizer } from "../notification/sim-s3-notification-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type {
  SimGetBucketNotificationConfigurationCommand,
  SimGetBucketNotificationConfigurationCommandOutput,
} from "./get-bucket-notification-configuration.command.js";

interface GetBucketNotificationConfigurationHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface GetBucketNotificationConfigurationHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated S3 GetBucketNotificationConfiguration command handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetBucketNotificationConfigurationCommand/
 */
export class GetBucketNotificationConfigurationCommandHandler implements CommandHandler<
  SimGetBucketNotificationConfigurationCommand,
  SimGetBucketNotificationConfigurationCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3NotificationAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetBucketNotificationConfigurationHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3NotificationAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Read a Bucket's event notification configuration.
   *
   * A Bucket nobody has configured answers an empty configuration rather than
   * an error, which is what real S3 does: a Bucket always has a notification
   * configuration, it is just usually empty.
   */
  async handle(
    command: SimGetBucketNotificationConfigurationCommand,
    options?: GetBucketNotificationConfigurationHandlerOptions,
  ): Promise<SimGetBucketNotificationConfigurationCommandOutput> {
    assertDefined(
      command.input.Bucket,
      "GetBucketNotificationConfigurationCommand.input.Bucket",
    );

    const bucketName = command.input.Bucket as SimS3BucketName;
    const bucket = requireSimS3Bucket(this.buckets, bucketName);

    await this.background.sequence();

    this.authorizer.authorizeRead(bucket, options?.caller);

    return {
      ...bucket.getNotifications().toOutput(),
      $metadata: {},
    };
  }
}
