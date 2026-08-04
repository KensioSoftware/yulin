import { randomUUID } from "node:crypto";
import type { SimS3NotificationFilterInput } from "../../command/put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
import { SimS3InvalidArgument } from "../../error/sim-s3.error.js";
import type { SimS3NotificationProperties } from "./sim-s3-notification.js";
import { simS3ExpandNotificationEvent } from "./sim-s3-notification-event.js";
import { SimS3NotificationFilter } from "./sim-s3-notification-filter.js";

/**
 * One destination group's shared shape on the way in.
 *
 * The destination ARN is the only part a group names differently, so it is
 * passed alongside rather than read from here.
 */
export interface SimS3NotificationInput {
  readonly Id?: string | undefined;
  readonly Events?: readonly string[] | undefined;
  readonly Filter?: SimS3NotificationFilterInput | undefined;
}

/**
 * Read one destination configuration into the parts a stored notification is
 * built from.
 */
export function simS3NotificationProperties(
  configuration: SimS3NotificationInput,
  destinationArn: string | undefined,
  missingArnReason: string,
): SimS3NotificationProperties {
  if (destinationArn === undefined || destinationArn === "") {
    throw new SimS3InvalidArgument(missingArnReason);
  }

  const events = configuration.Events ?? [];

  if (events.length === 0) {
    throw new SimS3InvalidArgument(
      `Notification configuration for ${destinationArn} names no events.`,
    );
  }

  return {
    // S3 generates a configuration id for a configuration that omits one, and
    // reports it back through GetBucketNotificationConfiguration.
    id: configuration.Id ?? randomUUID(),
    destinationArn,
    events,
    concreteEvents: new Set(
      events.flatMap((event) => simS3ExpandNotificationEvent(event)),
    ),
    filter: SimS3NotificationFilter.fromInput(configuration.Filter),
  };
}
