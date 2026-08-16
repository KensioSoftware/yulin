import { SimLogsInvalidParameterException } from "../error/sim-logs.error.js";
import { simLogsEventSizeBytes, type SimLogsStoredEvent } from "./sim-logs-event.js";
import type { SimLogsEventIds } from "./sim-logs-event-ids.js";

/** What real CloudWatch Logs accepts in one PutLogEvents batch. */
const maximumBatchEvents = 10_000;
const maximumBatchBytes = 1_048_576;

/**
 * A log event as a caller sends it, before it is accepted onto a stream.
 */
export interface SimLogsInputEvent {
  readonly timestamp?: number | undefined;
  readonly message?: string | undefined;
}

interface SimLogsEventBatchProperties {
  readonly events: readonly SimLogsInputEvent[] | undefined;
  readonly eventIds: SimLogsEventIds;
  readonly ingestionTime: number;
}

/**
 * One batch of log events, checked the way real CloudWatch Logs checks it.
 *
 * The chronological rule is the one worth having: a batch whose events are not
 * in ascending order is refused by an account and is easy to send by accident,
 * because the obvious way to build a batch is to collect lines from several
 * places and send them in whatever order they were collected.
 */
export class SimLogsEventBatch {
  readonly events: readonly SimLogsStoredEvent[];

  constructor(properties: SimLogsEventBatchProperties) {
    const events = requiredBatch(properties.events);

    this.events = events.map((event, index) => ({
      eventId: properties.eventIds.next(),
      timestamp: requiredTimestamp(event, index, events),
      ingestionTime: properties.ingestionTime,
      message: requiredMessage(event),
    }));
  }
}

function requiredBatch(
  events: readonly SimLogsInputEvent[] | undefined,
): readonly SimLogsInputEvent[] {
  if (events === undefined || events.length === 0) {
    throw new SimLogsInvalidParameterException(
      "1 validation error detected: Value at 'logEvents' failed to satisfy " +
        "constraint: Member must have length greater than or equal to 1",
    );
  }

  if (events.length > maximumBatchEvents) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value at 'logEvents' failed to satisfy ` +
        `constraint: Member must have length less than or equal to ` +
        `${maximumBatchEvents}`,
    );
  }

  refuseOversizedBatch(events);

  return events;
}

/**
 * Refuse a batch over the size limit, counting the per-event overhead real
 * CloudWatch Logs counts.
 */
function refuseOversizedBatch(events: readonly SimLogsInputEvent[]): void {
  const totalBytes = events.reduce(
    (total, event) => total + simLogsEventSizeBytes(event.message ?? ""),
    0,
  );

  if (totalBytes > maximumBatchBytes) {
    throw new SimLogsInvalidParameterException(
      `Log event batch of ${totalBytes} bytes exceeds the ` +
        `${maximumBatchBytes} byte limit`,
    );
  }
}

function requiredMessage(event: SimLogsInputEvent): string {
  if (event.message === undefined || event.message.length === 0) {
    throw new SimLogsInvalidParameterException(
      "1 validation error detected: Value at 'logEvents.message' failed to " +
        "satisfy constraint: Member must have length greater than or equal to 1",
    );
  }

  return event.message;
}

function requiredTimestamp(
  event: SimLogsInputEvent,
  index: number,
  events: readonly SimLogsInputEvent[],
): number {
  const { timestamp } = event;

  if (timestamp === undefined || !Number.isSafeInteger(timestamp)) {
    throw new SimLogsInvalidParameterException(
      "1 validation error detected: Value at 'logEvents.timestamp' failed " +
        "to satisfy constraint: Member must not be null",
    );
  }

  const previous = events[index - 1]?.timestamp;

  if (previous !== undefined && timestamp < previous) {
    throw new SimLogsInvalidParameterException(
      "Log events in a single PutLogEvents request must be in chronological " +
        "order.",
    );
  }

  return timestamp;
}
