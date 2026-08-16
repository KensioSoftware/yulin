import type { SimLogsStoredEvent } from "./sim-logs-event.js";

/**
 * The time range a read of log events asked for.
 */
export interface SimLogsEventWindowInput {
  readonly startTime?: number | undefined;
  readonly endTime?: number | undefined;
}

/**
 * Narrow events to the time range a request asked for.
 *
 * The range is half open, as real CloudWatch Logs documents it: an event whose
 * timestamp equals `startTime` is included and one whose timestamp equals
 * `endTime` is not. That asymmetry is easy to get wrong from either side, so a
 * test paging by time here sees the same boundaries it would see in an
 * account.
 */
export function simLogsEventsInWindow(
  events: readonly SimLogsStoredEvent[],
  window: SimLogsEventWindowInput,
): readonly SimLogsStoredEvent[] {
  const { startTime, endTime } = window;

  return events.filter(
    (event) =>
      (startTime === undefined || event.timestamp >= startTime) &&
      (endTime === undefined || event.timestamp < endTime),
  );
}
