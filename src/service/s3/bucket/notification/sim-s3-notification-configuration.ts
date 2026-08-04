import type { SimS3NotificationConfigurationOutput } from "../../command/get-bucket-notification-configuration/get-bucket-notification-configuration.command.js";
import type { SimS3LambdaNotification } from "./sim-s3-lambda-notification.js";
import type { SimS3Notification } from "./sim-s3-notification.js";
import type { SimS3NotificationEvent } from "./sim-s3-notification-event.js";
import type { SimS3QueueNotification } from "./sim-s3-queue-notification.js";

interface SimS3NotificationConfigurationProperties {
  readonly lambdaNotifications?: readonly SimS3LambdaNotification[];
  readonly queueNotifications?: readonly SimS3QueueNotification[];
}

/**
 * The event notification configuration of one simulated S3 Bucket.
 *
 * A Bucket has one configuration rather than a list of them, which is why
 * PutBucketNotificationConfiguration replaces the whole thing: real S3 has no
 * way to add one destination without restating the others.
 *
 * The destination groups are held apart because that is how they go in and come
 * back out. Everything that acts on a configuration, the overlap rule, the
 * destination check and delivery, works on `all` instead, since none of them
 * cares which kind of destination it is looking at.
 */
export class SimS3NotificationConfiguration {
  public readonly lambdaNotifications: readonly SimS3LambdaNotification[];
  public readonly queueNotifications: readonly SimS3QueueNotification[];

  constructor(properties: SimS3NotificationConfigurationProperties = {}) {
    this.lambdaNotifications = properties.lambdaNotifications ?? [];
    this.queueNotifications = properties.queueNotifications ?? [];
  }

  /**
   * The configuration a Bucket nobody has configured has.
   */
  static empty(): SimS3NotificationConfiguration {
    return new SimS3NotificationConfiguration();
  }

  /**
   * Every configured destination, whatever kind it is.
   */
  get all(): readonly SimS3Notification[] {
    return [...this.lambdaNotifications, ...this.queueNotifications];
  }

  /**
   * The destinations an event about an object key should reach.
   */
  matching(
    event: SimS3NotificationEvent,
    key: string,
  ): readonly SimS3Notification[] {
    return this.all.filter((notification) => notification.matches(event, key));
  }

  /**
   * This configuration as GetBucketNotificationConfiguration reports it.
   *
   * A destination group with nothing in it is left out rather than reported
   * empty, which is what real S3 answers for a Bucket with no configuration.
   */
  toOutput(): SimS3NotificationConfigurationOutput {
    return {
      ...(this.lambdaNotifications.length > 0 && {
        LambdaFunctionConfigurations: this.lambdaNotifications.map(
          (notification) => notification.toOutput(),
        ),
      }),
      ...(this.queueNotifications.length > 0 && {
        QueueConfigurations: this.queueNotifications.map((notification) =>
          notification.toOutput(),
        ),
      }),
    };
  }
}
