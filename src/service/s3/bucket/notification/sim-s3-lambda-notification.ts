import type { SimS3LambdaFunctionConfigurationInput } from "../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import type { SimS3NotificationDestinationService } from "../../notification/destination/sim-s3-notification-destination.js";
import { SimS3Notification } from "./sim-s3-notification.js";
import { simS3NotificationProperties } from "./sim-s3-notification-properties.js";

/**
 * One Lambda function destination in a Bucket's notification configuration.
 */
export class SimS3LambdaNotification extends SimS3Notification {
  /**
   * The kind of destination this configuration was declared for.
   */
  public readonly destinationService: SimS3NotificationDestinationService =
    "lambda";

  /**
   * Read one LambdaFunctionConfigurations entry.
   */
  static fromInput(
    configuration: SimS3LambdaFunctionConfigurationInput,
  ): SimS3LambdaNotification {
    return new SimS3LambdaNotification(
      simS3NotificationProperties(
        configuration,
        configuration.LambdaFunctionArn,
        "A Lambda function notification configuration must name a " +
          "LambdaFunctionArn.",
      ),
    );
  }

  /**
   * This configuration as GetBucketNotificationConfiguration reports it.
   */
  toOutput(): SimS3LambdaFunctionConfigurationInput {
    return { ...this.reported(), LambdaFunctionArn: this.destinationArn };
  }
}
