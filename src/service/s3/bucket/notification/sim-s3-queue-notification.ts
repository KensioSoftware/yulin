import type { SimS3QueueConfigurationInput } from "../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import type { SimS3NotificationDestinationService } from "../../notification/destination/sim-s3-notification-destination.js";
import { SimS3Notification } from "./sim-s3-notification.js";
import { simS3NotificationProperties } from "./sim-s3-notification-properties.js";

/**
 * One SQS queue destination in a Bucket's notification configuration.
 */
export class SimS3QueueNotification extends SimS3Notification {
  /**
   * The kind of destination this configuration was declared for.
   */
  public readonly destinationService: SimS3NotificationDestinationService =
    "sqs";

  /**
   * Read one QueueConfigurations entry.
   */
  static fromInput(
    configuration: SimS3QueueConfigurationInput,
  ): SimS3QueueNotification {
    return new SimS3QueueNotification(
      simS3NotificationProperties(
        configuration,
        configuration.QueueArn,
        "A queue notification configuration must name a QueueArn.",
      ),
    );
  }

  /**
   * This configuration as GetBucketNotificationConfiguration reports it.
   */
  toOutput(): SimS3QueueConfigurationInput {
    return { ...this.reported(), QueueArn: this.destinationArn };
  }
}
