import { SimS3InvalidArgument } from "../../error/sim-s3.error.js";
import type { SimS3Notification } from "./sim-s3-notification.js";

/**
 * Refuse a configuration that uses one id twice.
 *
 * Ids are unique within a Bucket rather than within a destination group, so a
 * function and a queue cannot share one either.
 */
export function simS3AssertNotificationIdsAreUnique(
  notifications: readonly SimS3Notification[],
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
