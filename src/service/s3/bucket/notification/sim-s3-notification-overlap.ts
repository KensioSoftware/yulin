import { SimS3InvalidArgument } from "../../error/sim-s3.error.js";
import type { SimS3LambdaNotification } from "./sim-s3-lambda-notification.js";

/**
 * Refuse a configuration whose destinations would both want the same event.
 *
 * Real S3 will not store two configurations that share an event type and whose
 * key filters could both match the same key, because it has no rule for which
 * of them wins. Overlapping prefixes are allowed when the suffixes do not
 * overlap, which is how one function takes the `.jpg` files under a prefix and
 * another takes the `.png` files under the same one.
 *
 * The comparison is on expanded event sets rather than on the configured event
 * strings, so `s3:ObjectCreated:*` conflicts with `s3:ObjectCreated:Put` as it
 * does on real S3.
 */
export function simS3AssertNoNotificationOverlap(
  notifications: readonly SimS3LambdaNotification[],
): void {
  for (const [index, notification] of notifications.entries()) {
    const rest = notifications.slice(index + 1);

    for (const other of rest) {
      if (
        notification.sharesEventsWith(other) &&
        notification.filter.overlaps(other.filter)
      ) {
        throw new SimS3InvalidArgument(
          `Configurations ${notification.id} and ${other.id} overlap. ` +
            "Configurations on the same Bucket cannot share an event type " +
            "with object key filters that could both match the same key.",
        );
      }
    }
  }
}
