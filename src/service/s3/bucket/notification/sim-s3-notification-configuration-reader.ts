import { randomUUID } from "node:crypto";
import type {
  SimS3LambdaFunctionConfigurationInput,
  SimS3NotificationConfigurationInput,
} from "../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import {
  SimS3InvalidArgument,
  SimS3NotImplemented,
} from "../../error/sim-s3.error.js";
import { SimS3LambdaNotification } from "./sim-s3-lambda-notification.js";
import { SimS3NotificationConfiguration } from "./sim-s3-notification-configuration.js";
import { simS3ExpandNotificationEvent } from "./sim-s3-notification-event.js";
import { SimS3NotificationFilter } from "./sim-s3-notification-filter.js";
import { simS3AssertNoNotificationOverlap } from "./sim-s3-notification-overlap.js";

/**
 * The destination groups a request can carry that this simulator does not
 * deliver to, and what to say about each.
 */
const unsimulatedDestinations = new Map<string, string>([
  ["QueueConfigurations", "SQS queue"],
  ["TopicConfigurations", "SNS topic"],
  ["EventBridgeConfiguration", "EventBridge"],
]);

/**
 * Reads a PutBucketNotificationConfiguration request into a Bucket's stored
 * configuration.
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
    this.refuseUnsimulatedDestinations(input);

    const notifications = (input.LambdaFunctionConfigurations ?? []).map(
      (configuration) => this.readLambdaNotification(configuration),
    );

    this.refuseRepeatedIds(notifications);
    simS3AssertNoNotificationOverlap(notifications);

    return new SimS3NotificationConfiguration(notifications);
  }

  private readLambdaNotification(
    configuration: SimS3LambdaFunctionConfigurationInput,
  ): SimS3LambdaNotification {
    const functionArn = configuration.LambdaFunctionArn;

    if (functionArn === undefined || functionArn === "") {
      throw new SimS3InvalidArgument(
        "A Lambda function notification configuration must name a " +
          "LambdaFunctionArn.",
      );
    }

    const events = configuration.Events ?? [];

    if (events.length === 0) {
      throw new SimS3InvalidArgument(
        `Notification configuration for ${functionArn} names no events.`,
      );
    }

    return new SimS3LambdaNotification({
      // S3 generates a configuration id for a configuration that omits one,
      // and reports it back through GetBucketNotificationConfiguration.
      id: configuration.Id ?? randomUUID(),
      functionArn,
      events,
      concreteEvents: new Set(
        events.flatMap((event) => simS3ExpandNotificationEvent(event)),
      ),
      filter: SimS3NotificationFilter.fromInput(configuration.Filter),
    });
  }

  /**
   * Refuse a destination group this simulator cannot deliver to.
   *
   * Naming the destination matters more than the refusal: a configuration
   * quietly accepted and never delivered is the failure this feature exists to
   * remove, so an SQS or SNS destination says so rather than being dropped.
   */
  private refuseUnsimulatedDestinations(
    input: SimS3NotificationConfigurationInput,
  ): void {
    for (const [property, destination] of unsimulatedDestinations) {
      // Read-only lookup of a fixed set of property names.

      const configured = input[property as keyof typeof input];

      if (configured === undefined) {
        continue;
      }

      if (Array.isArray(configured) && configured.length === 0) {
        continue;
      }

      throw new SimS3NotImplemented(
        `Simulated S3 cannot notify a ${destination}. ${property} is not ` +
          "simulated; use LambdaFunctionConfigurations.",
      );
    }
  }

  private refuseRepeatedIds(
    notifications: readonly SimS3LambdaNotification[],
  ): void {
    const seen = new Set<string>();

    for (const notification of notifications) {
      if (seen.has(notification.id)) {
        throw new SimS3InvalidArgument(
          `Configuration id ${notification.id} is used more than once. ` +
            "Configuration ids must be unique within a Bucket.",
        );
      }

      seen.add(notification.id);
    }
  }
}
