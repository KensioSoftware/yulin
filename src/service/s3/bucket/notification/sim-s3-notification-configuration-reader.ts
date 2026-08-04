import type { SimS3NotificationConfigurationInput } from "../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import { SimS3LambdaNotification } from "./sim-s3-lambda-notification.js";
import { SimS3NotificationConfiguration } from "./sim-s3-notification-configuration.js";
import { simS3AssertNotificationIdsAreUnique } from "./sim-s3-notification-ids.js";
import { simS3AssertNoNotificationOverlap } from "./sim-s3-notification-overlap.js";
import { SimS3QueueNotification } from "./sim-s3-queue-notification.js";
import { simS3RefuseUnsimulatedDestinations } from "./sim-s3-unsimulated-notification-destinations.js";

/**
 * Reads a PutBucketNotificationConfiguration request into a Bucket's stored
 * configuration.
 *
 * Each destination group reads its own entries, since the ARN is the only part
 * they spell differently. What is left here is the pair of rules that are about
 * the configuration as a whole rather than about one entry of it, and both look
 * across the groups: real S3 refuses a function and a queue that share an id or
 * want the same event as readily as it refuses two functions.
 *
 * Everything the request states is checked before anything is stored, so a
 * request the simulator refuses leaves the Bucket's previous configuration
 * exactly as it was.
 */
export class SimS3NotificationConfigurationReader {
  /**
   * Read a whole notification configuration.
   */
  read(
    input: SimS3NotificationConfigurationInput,
  ): SimS3NotificationConfiguration {
    simS3RefuseUnsimulatedDestinations(input);

    const configuration = new SimS3NotificationConfiguration({
      lambdaNotifications: (input.LambdaFunctionConfigurations ?? []).map(
        (entry) => SimS3LambdaNotification.fromInput(entry),
      ),
      queueNotifications: (input.QueueConfigurations ?? []).map((entry) =>
        SimS3QueueNotification.fromInput(entry),
      ),
    });

    simS3AssertNotificationIdsAreUnique(configuration.all);
    simS3AssertNoNotificationOverlap(configuration.all);

    return configuration;
  }
}
