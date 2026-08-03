import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimS3NotificationEvent } from "../bucket/notification/sim-s3-notification-event.js";
import type { SimS3Bucket } from "../bucket/sim-s3-bucket.js";
import type { SimS3ObjectEvent } from "./event/sim-s3-object-event.js";
import type { SimS3NotificationDispatcher } from "./sim-s3-notification-dispatcher.js";

interface SimS3NotificationScheduleProperties {
  readonly background: BackgroundScheduler;
  readonly dispatcher: SimS3NotificationDispatcher;
}

/**
 * Puts an Object event on its way to the destinations a Bucket configured.
 *
 * Delivery happens on the background scheduler, as real S3 delivers after the
 * request that caused it has been answered. `simAws.backgroundTasksComplete()`
 * is what waits for it.
 */
export class SimS3NotificationSchedule {
  private readonly background: BackgroundScheduler;
  private readonly dispatcher: SimS3NotificationDispatcher;

  constructor(properties: SimS3NotificationScheduleProperties) {
    this.background = properties.background;
    this.dispatcher = properties.dispatcher;
  }

  /**
   * Schedule delivery to every configuration that wants this event.
   *
   * The event is built only once something wants it, because building one
   * hashes the Object's bytes and a Bucket nobody configured should not pay
   * for that.
   */
  matching(
    bucket: SimS3Bucket,
    eventName: SimS3NotificationEvent,
    key: string,
    build: () => SimS3ObjectEvent,
  ): void {
    const wanting = bucket.getNotifications().matching(eventName, key);

    if (wanting.length === 0) {
      return;
    }

    const event = build();

    for (const notification of wanting) {
      this.background.schedule(async () => {
        await this.dispatcher.deliver(notification, event);
      });
    }
  }
}
