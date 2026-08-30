import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimS3NotificationDestinations } from "./destination/sim-s3-notification-destination.js";
import {
  type SimS3ObjectCreatedInput,
  type SimS3ObjectRemovedInput,
  SimS3ObjectEventBuilder,
} from "./event/sim-s3-object-event-builder.js";
import { SimS3NotificationDispatcher } from "./sim-s3-notification-dispatcher.js";
import type { SimS3NotificationDeliveryFailure } from "./sim-s3-notification-failures.js";
import { SimS3NotificationSchedule } from "./sim-s3-notification-schedule.js";

interface SimS3ObjectNotifierProperties {
  readonly destinations: SimS3NotificationDestinations;
  readonly background: BackgroundScheduler;
  readonly deliveryLimit?: number | undefined;
}

/**
 * Raises simulated S3 Object events to the destinations a Bucket configured.
 *
 * The Object commands call this once each, after the write has happened and
 * with the caller they authorized, because that is the only layer holding both
 * the caller and the knowledge of which event this is. One notifier is shared
 * across the commands of a simulated S3 scope, so the per-key sequence numbers
 * and the delivery ceiling see every event rather than one command's worth.
 */
export class SimS3ObjectNotifier {
  private readonly events: SimS3ObjectEventBuilder;
  private readonly dispatcher: SimS3NotificationDispatcher;
  private readonly schedule: SimS3NotificationSchedule;

  constructor(properties: SimS3ObjectNotifierProperties) {
    this.events = new SimS3ObjectEventBuilder({
      clock: properties.background,
    });
    this.dispatcher = new SimS3NotificationDispatcher(properties);
    this.schedule = new SimS3NotificationSchedule({
      background: properties.background,
      dispatcher: this.dispatcher,
    });
  }

  /**
   * Every notification this scope could not deliver.
   */
  get deliveryFailures(): readonly SimS3NotificationDeliveryFailure[] {
    return this.dispatcher.deliveryFailures;
  }

  /**
   * Raise an Object creation, as whichever kind of creation it was.
   */
  objectCreated(input: SimS3ObjectCreatedInput): void {
    this.schedule.matching(
      input.bucket,
      input.eventName,
      input.object.key,
      () => this.events.forCreated(input),
    );
  }

  /**
   * Raise an Object removal, as whichever kind of removal it was.
   */
  objectRemoved(input: SimS3ObjectRemovedInput): void {
    this.schedule.matching(input.bucket, input.eventName, input.key, () =>
      this.events.forRemoved(input),
    );
  }
}
