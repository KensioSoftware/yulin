import type { SimSqsMessageCounts } from "../message/sim-sqs-message-store.js";
import type { SimSqsQueueAttributes } from "./sim-sqs-queue-attributes.js";

const millisecondsPerSecond = 1000;

/**
 * Real SQS reports the two queue timestamps in whole seconds since the epoch,
 * unlike the message timestamps, which are in milliseconds.
 */
function epochSeconds(instant: Date): string {
  return String(Math.floor(instant.getTime() / millisecondsPerSecond));
}

/**
 * What one queue is at an instant, as the attributes are read off it.
 */
export interface SimSqsQueueReport {
  readonly settings: SimSqsQueueAttributes;
  readonly counts: SimSqsMessageCounts;
  readonly createdAt: Date;
  readonly lastModifiedAt: Date;
  readonly queueArn: string;
}

/**
 * The attributes SQS reports about a queue.
 *
 * This is the settable attributes together with the ones the queue itself
 * decides: how many messages are in each state, when it was created and last
 * changed, and its ARN. No request can set those, so they are built here rather
 * than held with the settings.
 */
export function simSqsReportedQueueAttributes(
  report: SimSqsQueueReport,
): ReadonlyMap<string, string> {
  const { settings, counts, createdAt, lastModifiedAt, queueArn } = report;

  return new Map<string, string>([
    ...settings.reported(),
    ["ApproximateNumberOfMessages", String(counts.visible)],
    ["ApproximateNumberOfMessagesDelayed", String(counts.delayed)],
    ["ApproximateNumberOfMessagesNotVisible", String(counts.inFlight)],
    ["CreatedTimestamp", epochSeconds(createdAt)],
    ["LastModifiedTimestamp", epochSeconds(lastModifiedAt)],
    ["QueueArn", queueArn],
  ]);
}
