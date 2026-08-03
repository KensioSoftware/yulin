import type { SimS3NotificationConfigurationOutput } from "../../command/get-bucket-notification-configuration/get-bucket-notification-configuration.command.js";
import type { SimS3LambdaNotification } from "./sim-s3-lambda-notification.js";
import type { SimS3NotificationEvent } from "./sim-s3-notification-event.js";

/**
 * The event notification configuration of one simulated S3 Bucket.
 *
 * A Bucket has one configuration rather than a list of them, which is why
 * PutBucketNotificationConfiguration replaces the whole thing: real S3 has no
 * way to add one destination without restating the others.
 */
export class SimS3NotificationConfiguration {
  public readonly lambdaNotifications: readonly SimS3LambdaNotification[];

  constructor(lambdaNotifications: readonly SimS3LambdaNotification[] = []) {
    this.lambdaNotifications = lambdaNotifications;
  }

  /**
   * The configuration a Bucket nobody has configured has.
   */
  static empty(): SimS3NotificationConfiguration {
    return new SimS3NotificationConfiguration();
  }

  /**
   * Whether this Bucket notifies anything at all.
   */
  get notifiesNothing(): boolean {
    return this.lambdaNotifications.length === 0;
  }

  /**
   * The destinations an event about an object key should reach.
   */
  matching(
    event: SimS3NotificationEvent,
    key: string,
  ): readonly SimS3LambdaNotification[] {
    return this.lambdaNotifications.filter((notification) =>
      notification.matches(event, key),
    );
  }

  /**
   * This configuration as GetBucketNotificationConfiguration reports it.
   *
   * A destination group with nothing in it is left out rather than reported
   * empty, which is what real S3 answers for a Bucket with no configuration.
   */
  toOutput(): SimS3NotificationConfigurationOutput {
    if (this.notifiesNothing) {
      return {};
    }

    return {
      LambdaFunctionConfigurations: this.lambdaNotifications.map(
        (notification) => notification.toOutput(),
      ),
    };
  }
}
