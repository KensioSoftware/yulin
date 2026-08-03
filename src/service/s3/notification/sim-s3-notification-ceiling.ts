import { SimS3NotificationDeliveryLimit } from "../error/sim-s3-notification.error.js";

/**
 * How many notifications one simulated S3 scope will deliver.
 *
 * High enough that no honest simulation reaches it, low enough that a loop
 * fails in a moment rather than running until the test times out.
 */
export const SIM_S3_NOTIFICATION_DELIVERY_LIMIT = 1000;

/**
 * The ceiling on notifications a simulated S3 scope delivers.
 *
 * A handler that writes back into the Bucket that triggered it never stops in
 * process, and `backgroundTasksComplete()` waits for work to run out, so the
 * test hangs with nothing to read. Prefix and suffix filters are the way to
 * write that architecture safely, and this is what says so when they are
 * missing.
 */
export class SimS3NotificationCeiling {
  private readonly limit: number;
  private delivered = 0;

  constructor(limit: number = SIM_S3_NOTIFICATION_DELIVERY_LIMIT) {
    this.limit = limit;
  }

  /**
   * Count one delivery, refusing once the ceiling is reached.
   */
  take(bucketName: string): void {
    this.delivered += 1;

    if (this.delivered > this.limit) {
      throw new SimS3NotificationDeliveryLimit(
        `Simulated S3 has delivered ${String(this.limit)} event ` +
          `notifications and stopped, while notifying for Bucket ` +
          `${bucketName}. A handler that writes back into the Bucket that ` +
          "triggered it notifies itself " +
          "forever; filter the notification configuration by prefix or " +
          "suffix so the handler's own writes do not match it.",
      );
    }
  }
}
