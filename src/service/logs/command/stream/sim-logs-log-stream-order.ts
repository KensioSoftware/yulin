import { SimLogsInvalidParameterException } from "../../error/sim-logs.error.js";
import type { SimLogsLogStream } from "../../stream/sim-logs-log-stream.js";
import type { SimDescribeLogStreamsCommandInput } from "./stream.command.js";

const orderByLogStreamName = "LogStreamName";
const orderByLastEventTime = "LastEventTime";

/**
 * Put the streams of a log group in the order a DescribeLogStreams request
 * asked for.
 *
 * Real CloudWatch Logs orders by stream name unless asked for last event time,
 * and refuses a name prefix alongside that ordering, because the two ask it to
 * read the same index in two different ways.
 */
export function orderedSimLogsLogStreams(
  streams: readonly SimLogsLogStream[],
  input: SimDescribeLogStreamsCommandInput,
): readonly SimLogsLogStream[] {
  const orderBy = input.orderBy ?? orderByLogStreamName;

  if (orderBy !== orderByLogStreamName && orderBy !== orderByLastEventTime) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value '${orderBy}' at 'orderBy' failed ` +
        `to satisfy constraint: Member must satisfy enum value set: ` +
        `[${orderByLogStreamName}, ${orderByLastEventTime}]`,
    );
  }

  if (orderBy === orderByLastEventTime && input.logStreamNamePrefix !== undefined) {
    throw new SimLogsInvalidParameterException(
      "Cannot order by LastEventTime with a logStreamNamePrefix.",
    );
  }

  const ordered = [...streams].sort((left, right) =>
    orderBy === orderByLastEventTime
      ? lastEventTime(left) - lastEventTime(right)
      : left.logStreamName.localeCompare(right.logStreamName),
  );

  return input.descending === true ? ordered.reverse() : ordered;
}

/**
 * When a stream last had an event, treating one that has never had an event as
 * the oldest so it sorts before the streams that have.
 */
function lastEventTime(stream: SimLogsLogStream): number {
  return stream.lastEventTimestamp ?? 0;
}
