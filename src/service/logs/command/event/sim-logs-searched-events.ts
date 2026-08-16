import { SimLogsInvalidParameterException } from "../../error/sim-logs.error.js";
import { simLogsEventsInWindow } from "../../event/sim-logs-event-window.js";
import type { SimLogsFilterPattern } from "../../event/sim-logs-filter-pattern.js";
import type { SimLogsLogGroup } from "../../group/sim-logs-log-group.js";
import type { SimLogsLogStream } from "../../stream/sim-logs-log-stream.js";
import type {
  SimFilterLogEventsCommandInput,
  SimLogsFilteredLogEvent,
} from "./event.command.js";

/**
 * The streams a FilterLogEvents request searches: named ones, ones under a
 * prefix, or all of them.
 *
 * Real CloudWatch Logs refuses both selectors at once rather than deciding
 * which wins, so this does too, and it refuses an empty list of names rather
 * than searching nothing: a caller that built the list dynamically would
 * otherwise get an empty page back and read it as nothing having matched.
 *
 * A name in the list that no stream has is not an error there or here; it
 * simply contributes nothing.
 */
export function searchedSimLogsStreams(
  group: SimLogsLogGroup,
  input: SimFilterLogEventsCommandInput,
): readonly SimLogsLogStream[] {
  const { logStreamNames, logStreamNamePrefix } = input;

  if (logStreamNames !== undefined && logStreamNamePrefix !== undefined) {
    throw new SimLogsInvalidParameterException(
      "Only one of logStreamNames or logStreamNamePrefix can be specified.",
    );
  }

  if (logStreamNames !== undefined) {
    refuseEmptyNames(logStreamNames);

    return group.streams.filter((stream) =>
      logStreamNames.includes(stream.logStreamName),
    );
  }

  return group.streams.filter((stream) =>
    stream.logStreamName.startsWith(logStreamNamePrefix ?? ""),
  );
}

/**
 * The events of one stream that a request's window and pattern both admit.
 */
export function filteredSimLogsEvents(
  stream: SimLogsLogStream,
  input: SimFilterLogEventsCommandInput,
  pattern: SimLogsFilterPattern,
): readonly SimLogsFilteredLogEvent[] {
  return simLogsEventsInWindow(stream.events, input)
    .filter((event) => pattern.matches(event.message))
    .map((event) => ({
      logStreamName: stream.logStreamName,
      timestamp: event.timestamp,
      ingestionTime: event.ingestionTime,
      message: event.message,
      eventId: event.eventId,
    }));
}

function refuseEmptyNames(logStreamNames: readonly string[]): void {
  if (logStreamNames.length === 0) {
    throw new SimLogsInvalidParameterException(
      "1 validation error detected: Value at 'logStreamNames' failed to " +
        "satisfy constraint: Member must have length greater than or equal " +
        "to 1",
    );
  }
}
