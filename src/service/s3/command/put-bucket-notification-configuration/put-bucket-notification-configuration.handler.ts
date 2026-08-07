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
import { SimS3NotificationConfigurationReader } from "../../bucket/notification/sim-s3-notification-configuration-reader.js";
import type {
  SimS3Bucket,
  SimS3BucketName,
} from "../../bucket/sim-s3-bucket.js";
import { SimS3NotificationDestinationCheck } from "../../notification/destination/sim-s3-notification-destination-check.js";
import type { SimS3NotificationDestinations } from "../../notification/destination/sim-s3-notification-destination.js";
import { SimS3NotificationAuthorizer } from "../notification/sim-s3-notification-authorizer.js";
import { requireSimS3Bucket } from "../require-sim-s3-bucket.js";
import type {
  SimPutBucketNotificationConfigurationCommand,
  SimPutBucketNotificationConfigurationCommandOutput,
} from "./put-bucket-notification-configuration.command.js";

interface PutBucketNotificationConfigurationHandlerProperties {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly notificationDestinations: SimS3NotificationDestinations;
}

/**
 * Simulated S3 PutBucketNotificationConfiguration command handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutBucketNotificationConfigurationCommand/
 */
export class PutBucketNotificationConfigurationCommandHandler implements CommandHandler<
  SimPutBucketNotificationConfigurationCommand,
  SimPutBucketNotificationConfigurationCommandOutput
> {
  private readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  private readonly authorizer: SimS3NotificationAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly destinations: SimS3NotificationDestinationCheck;
  private readonly reader = new SimS3NotificationConfigurationReader();

  constructor(properties: PutBucketNotificationConfigurationHandlerProperties) {
    const {
      buckets,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      notificationDestinations,
    } = properties;

    this.buckets = buckets;
    this.authorizer = new SimS3NotificationAuthorizer({ iam });
    this.background = background;
    this.destinations = new SimS3NotificationDestinationCheck(
      notificationDestinations,
    );
  }

  /**
   * Replace a Bucket's whole event notification configuration.
   *
   * The request is read, then every destination it names is checked, and only
   * then is anything stored, so a request the simulator refuses leaves the
   * Bucket's previous configuration exactly as it was.
   */
  async handle(
    command: SimPutBucketNotificationConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<SimPutBucketNotificationConfigurationCommandOutput> {
    const input = command.input;
    assertDefined(
      input.Bucket,
      "PutBucketNotificationConfigurationCommand.input.Bucket",
    );
    assertDefined(
      input.NotificationConfiguration,
      "PutBucketNotificationConfigurationCommand.input.NotificationConfiguration",
    );

    const bucket = requireSimS3Bucket(
      this.buckets,
      input.Bucket as SimS3BucketName,
    );

    await this.background.sequence();

    this.authorizer.authorizeWrite(bucket, options);

    const configuration = this.reader.read(input.NotificationConfiguration);

    if (input.SkipDestinationValidation !== true) {
      this.destinations.check(bucket, configuration);
    }

    bucket.configureNotifications(configuration);

    return {
      $metadata: {},
    };
  }
}
