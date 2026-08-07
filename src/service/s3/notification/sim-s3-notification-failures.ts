import { SimS3NotificationNotPermitted } from "../error/sim-s3-notification.error.js";
import type { SimS3ObjectEvent } from "./event/sim-s3-object-event.js";

interface SimS3NotificationDeliveryFailureProperties {
  readonly event: SimS3ObjectEvent;
  readonly destinationArn: string;
  readonly configurationId: string;
  readonly error: unknown;
}

/**
 * One event a destination did not take.
 */
export class SimS3NotificationDeliveryFailure {
  public readonly event: SimS3ObjectEvent;
  public readonly destinationArn: string;
  public readonly configurationId: string;
  public readonly error: unknown;

  constructor(properties: SimS3NotificationDeliveryFailureProperties) {
    this.event = properties.event;
    this.destinationArn = properties.destinationArn;
    this.configurationId = properties.configurationId;
    this.error = properties.error;
  }

  /**
   * Whether the destination refused the event rather than failing on it.
   */
  get wasRefused(): boolean {
    return this.error instanceof SimS3NotificationNotPermitted;
  }

  /**
   * What went wrong, in one line.
   */
  get reason(): string {
    return this.error instanceof Error
      ? this.error.message
      : String(this.error);
  }
}

/**
 * What became of the notifications a simulated S3 scope could not deliver.
 *
 * Real S3 tells the caller who wrote the Object nothing about a failed
 * delivery, and neither does this: a handler that throws must not fail the
 * PutObject that triggered it. Swallowing the failure entirely would make a
 * broken handler invisible, so every failure is kept for inspection and a
 * handler that threw is also warned about once.
 */
export class SimS3NotificationFailures {
  private readonly failures: SimS3NotificationDeliveryFailure[] = [];
  private readonly warned = new Set<string>();

  /**
   * Every notification this scope could not deliver, oldest first.
   */
  get all(): readonly SimS3NotificationDeliveryFailure[] {
    return this.failures;
  }

  /**
   * Record a failed delivery.
   */
  record(failure: SimS3NotificationDeliveryFailure): void {
    this.failures.push(failure);

    if (failure.wasRefused) {
      // A refusal is a modelled outcome rather than a fault: the resource
      // policy says no, which is what a test removing a permission is
      // checking for. It is recorded, not warned about.
      return;
    }

    this.warn(failure);
  }

  /**
   * Warn about a destination that failed, once per destination and cause.
   *
   * Warnings go to the console because that is where a test runner surfaces
   * them next to the failing expectation they explain; the simulator has no
   * logger of its own to route them through.
   */
  private warn(failure: SimS3NotificationDeliveryFailure): void {
    const key = `${failure.destinationArn}:${failure.reason}`;

    if (this.warned.has(key)) {
      return;
    }

    this.warned.add(key);

    // oxlint-disable-next-line no-console
    console.warn(
      `Simulated S3 Bucket ${failure.event.bucketName} could not notify ` +
        `${failure.destinationArn} of ${failure.event.eventName}: ${
          failure.reason
        }`,
    );
  }
}
