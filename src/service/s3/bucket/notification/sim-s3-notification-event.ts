import {
  SimS3InvalidArgument,
  SimS3NotImplemented,
} from "../../error/sim-s3.error.js";
import { SIM_S3_UNSIMULATED_NOTIFICATION_EVENTS } from "./sim-s3-unsimulated-notification-events.js";

/**
 * The event types simulated S3 can actually raise.
 *
 * These are the concrete members that a configured event expands to. Real S3
 * has many more, and the ones it has that this simulator cannot produce are
 * refused by name rather than accepted and never delivered.
 */
export const SIM_S3_NOTIFICATION_EVENTS = [
  "s3:ObjectCreated:Put",
  "s3:ObjectCreated:Copy",
  "s3:ObjectCreated:CompleteMultipartUpload",
  "s3:ObjectRemoved:Delete",
  "s3:ObjectRemoved:DeleteMarkerCreated",
  "s3:ObjectTagging:Put",
  "s3:ObjectTagging:Delete",
] as const;

export type SimS3NotificationEvent =
  (typeof SIM_S3_NOTIFICATION_EVENTS)[number];

/**
 * What each configurable event type expands to.
 *
 * A `:*` event is expanded before anything compares two configurations,
 * because the overlap rule is about event sets rather than event strings: real
 * S3 refuses `s3:ObjectCreated:*` alongside `s3:ObjectCreated:Put` on the same
 * filter, and comparing the two as strings would accept it.
 *
 * The wildcards expand only to the members this simulator can raise. The other
 * members are refused by name, so nothing can configure one and then wonder
 * why the wildcard never covered it.
 */
const eventExpansions = new Map<string, readonly SimS3NotificationEvent[]>([
  [
    "s3:ObjectCreated:*",
    [
      "s3:ObjectCreated:Put",
      "s3:ObjectCreated:Copy",
      "s3:ObjectCreated:CompleteMultipartUpload",
    ],
  ],
  ["s3:ObjectCreated:Put", ["s3:ObjectCreated:Put"]],
  ["s3:ObjectCreated:Copy", ["s3:ObjectCreated:Copy"]],
  [
    "s3:ObjectCreated:CompleteMultipartUpload",
    ["s3:ObjectCreated:CompleteMultipartUpload"],
  ],
  [
    "s3:ObjectRemoved:*",
    ["s3:ObjectRemoved:Delete", "s3:ObjectRemoved:DeleteMarkerCreated"],
  ],
  ["s3:ObjectRemoved:Delete", ["s3:ObjectRemoved:Delete"]],
  [
    "s3:ObjectRemoved:DeleteMarkerCreated",
    ["s3:ObjectRemoved:DeleteMarkerCreated"],
  ],
  ["s3:ObjectTagging:*", ["s3:ObjectTagging:Put", "s3:ObjectTagging:Delete"]],
  ["s3:ObjectTagging:Put", ["s3:ObjectTagging:Put"]],
  ["s3:ObjectTagging:Delete", ["s3:ObjectTagging:Delete"]],
]);

/**
 * The concrete events a configured event type covers.
 *
 * An event type real S3 has but this simulator cannot raise is refused as not
 * implemented. Anything else is not an S3 event type at all, which is what
 * real S3 answers InvalidArgument to.
 */
export function simS3ExpandNotificationEvent(
  event: string,
): readonly SimS3NotificationEvent[] {
  const expansion = eventExpansions.get(event);

  if (expansion !== undefined) {
    return expansion;
  }

  if (SIM_S3_UNSIMULATED_NOTIFICATION_EVENTS.has(event)) {
    throw new SimS3NotImplemented(
      `Simulated S3 does not raise the event type ${event}. It raises ` +
        `${eventExpansions.keys().toArray().join(", ")}.`,
    );
  }

  throw new SimS3InvalidArgument(
    `The event ${event} is not a supported S3 event type.`,
  );
}
