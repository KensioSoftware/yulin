import { gzipSync } from "node:zlib";
import type { SimLogsStoredEvent } from "../event/sim-logs-event.js";

/**
 * What a subscription filter is delivering, before it is encoded.
 */
export interface SimLogsSubscriptionDelivery {
  readonly owner: string;
  readonly logGroupName: string;
  readonly logStreamName: string;
  readonly filterName: string;
  readonly events: readonly SimLogsStoredEvent[];
}

/**
 * The decoded document a subscription filter delivers.
 *
 * `messageType` is always `DATA_MESSAGE`. Real CloudWatch Logs also sends a
 * `CONTROL_MESSAGE` to check a destination is reachable, which nothing here
 * does: there is no destination to keep warm in this process.
 */
export interface SimLogsSubscriptionEventDocument {
  readonly messageType: "DATA_MESSAGE";
  readonly owner: string;
  readonly logGroup: string;
  readonly logStream: string;
  readonly subscriptionFilters: readonly string[];
  readonly logEvents: readonly SimLogsSubscriptionLogEvent[];
}

export interface SimLogsSubscriptionLogEvent {
  readonly id: string;
  readonly timestamp: number;
  readonly message: string;
}

/**
 * Build the document a subscription filter delivers.
 */
export function simLogsSubscriptionEventDocument(
  delivery: SimLogsSubscriptionDelivery,
): SimLogsSubscriptionEventDocument {
  return {
    messageType: "DATA_MESSAGE",
    owner: delivery.owner,
    logGroup: delivery.logGroupName,
    logStream: delivery.logStreamName,
    subscriptionFilters: [delivery.filterName],
    logEvents: delivery.events.map((event) => ({
      id: event.eventId,
      timestamp: event.timestamp,
      message: event.message,
    })),
  };
}

/**
 * The payload a Lambda destination receives.
 *
 * The document is gzipped and base64 encoded under `awslogs.data`, which is
 * the shape every subscription handler in the wild is written against: the
 * first thing such a handler does is gunzip that field. Delivering the
 * document in the clear would be easier to read in a test and would break
 * every real handler, so it is encoded exactly as AWS encodes it.
 */
export function simLogsSubscriptionEventPayload(
  delivery: SimLogsSubscriptionDelivery,
): { readonly awslogs: { readonly data: string } } {
  const document = simLogsSubscriptionEventDocument(delivery);
  const gzipped = gzipSync(Buffer.from(JSON.stringify(document), "utf8"));

  return { awslogs: { data: gzipped.toString("base64") } };
}
