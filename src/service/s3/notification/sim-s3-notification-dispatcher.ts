import type { SimS3Notification } from "../bucket/notification/sim-s3-notification.js";
import type { SimS3NotificationDestinations } from "./destination/sim-s3-notification-destination.js";
import type { SimS3ObjectEvent } from "./event/sim-s3-object-event.js";
import { SimS3NotificationCeiling } from "./sim-s3-notification-ceiling.js";
import {
  SimS3NotificationDeliveryFailure,
  SimS3NotificationFailures,
} from "./sim-s3-notification-failures.js";

interface SimS3NotificationDispatcherProperties {
  readonly destinations: SimS3NotificationDestinations;
  readonly deliveryLimit?: number | undefined;
}

/**
 * Offers one event to one destination, and keeps what came of it.
 *
 * Everything a destination raises is recorded rather than thrown, because a
 * background task left rejected would fail an unrelated
 * `backgroundTasksComplete()`, and real S3 never reports a delivery failure to
 * the caller who wrote the Object. The delivery ceiling is the exception, and
 * is counted outside the guard so that it escapes.
 */
export class SimS3NotificationDispatcher {
  private readonly destinations: SimS3NotificationDestinations;
  private readonly failures = new SimS3NotificationFailures();
  private readonly ceiling: SimS3NotificationCeiling;

  constructor(properties: SimS3NotificationDispatcherProperties) {
    this.destinations = properties.destinations;
    this.ceiling = new SimS3NotificationCeiling(properties.deliveryLimit);
  }

  /**
   * Every notification this scope could not deliver.
   */
  get deliveryFailures(): readonly SimS3NotificationDeliveryFailure[] {
    return this.failures.all;
  }

  /**
   * Deliver one event to the destination one configuration names.
   */
  async deliver(
    notification: SimS3Notification,
    event: SimS3ObjectEvent,
  ): Promise<void> {
    this.ceiling.take(event.bucketName);

    try {
      await this.destinations
        .resolve(notification.destinationService, notification.destinationArn)
        .deliver({
          destinationArn: notification.destinationArn,
          bucketArn: event.bucketArn,
          bucketOwnerAccountId: event.ownerAccountId,
          bucketRegionName: event.regionName,
          configurationId: notification.id,
          event,
        });
    } catch (error) {
      this.failures.record(
        new SimS3NotificationDeliveryFailure({
          event,
          destinationArn: notification.destinationArn,
          configurationId: notification.id,
          error,
        }),
      );
    }
  }
}
