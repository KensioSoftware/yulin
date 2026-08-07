import type { SimS3TopicConfigurationInput } from "../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import type { SimS3NotificationDestinationService } from "../../notification/destination/sim-s3-notification-destination.js";
import { SimS3Notification } from "./sim-s3-notification.js";
import { simS3NotificationProperties } from "./sim-s3-notification-properties.js";

/**
 * One SNS topic destination in a Bucket's notification configuration.
 */
export class SimS3TopicNotification extends SimS3Notification {
  /**
   * The kind of destination this configuration was declared for.
   */
  public readonly destinationService: SimS3NotificationDestinationService =
    "sns";

  /**
   * Read one TopicConfigurations entry.
   */
  static fromInput(
    configuration: SimS3TopicConfigurationInput,
  ): SimS3TopicNotification {
    return new SimS3TopicNotification(
      simS3NotificationProperties(
        configuration,
        configuration.TopicArn,
        "A topic notification configuration must name a TopicArn.",
      ),
    );
  }

  /**
   * This configuration as GetBucketNotificationConfiguration reports it.
   */
  toOutput(): SimS3TopicConfigurationInput {
    return { ...this.reported(), TopicArn: this.destinationArn };
  }
}
