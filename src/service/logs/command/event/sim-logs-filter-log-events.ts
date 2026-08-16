import { SimLogsInvalidParameterException } from "../../error/sim-logs.error.js";
import { compareSimLogsEvents } from "../../event/sim-logs-event.js";
import { simLogsEventsInWindow } from "../../event/sim-logs-event-window.js";
import { SimLogsFilterPattern } from "../../event/sim-logs-filter-pattern.js";
import type { SimLogsLogGroup } from "../../group/sim-logs-log-group.js";
import { requiredSimLogsLogGroupName } from "../../group/sim-logs-log-group-name.js";
import type { SimLogsLogGroupStore } from "../../group/sim-logs-log-group-store.js";
import type { SimLogsLogStream } from "../../stream/sim-logs-log-stream.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import { SimLogsPage } from "../sim-logs-page.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import type {
  SimFilterLogEventsCommand,
  SimFilterLogEventsCommandInput,
  SimFilterLogEventsCommandOutput,
  SimLogsFilteredLogEvent,
} from "./event.command.js";

const maximumLimit = 10_000;

interface SimLogsFilterLogEventsProperties {
  readonly groups: SimLogsLogGroupStore;
  readonly authorizer: SimLogsAuthorizer;
}

/**
 * The command that searches a log group's events across its streams.
 *
 * This is the one a test reaches for: it names the group rather than a stream,
 * so an assertion about what a function logged does not have to know which
 * execution environment wrote it.
 */
export class SimLogsFilterLogEvents {
  readonly #groups: SimLogsLogGroupStore;
  readonly #authorizer: SimLogsAuthorizer;

  constructor(properties: SimLogsFilterLogEventsProperties) {
    this.#groups = properties.groups;
    this.#authorizer = properties.authorizer;
  }

  /**
   * Search a log group's events, oldest first.
   */
  handle(
    command: SimFilterLogEventsCommand,
    options?: SimLogsRequestOptions,
  ): SimFilterLogEventsCommandOutput {
    const input = command.input;
    const logGroupName = requiredSimLogsLogGroupName(input.logGroupName);

    this.#authorizer.authorizeLogGroup(
      "logs:FilterLogEvents",
      logGroupName,
      options?.caller,
    );

    const pattern = new SimLogsFilterPattern(input.filterPattern);
    const group = this.#groups.require(logGroupName);
    const matched = searchedStreams(group, input)
      .flatMap((stream) => filteredEvents(stream, input, pattern))
      .sort((left, right) => compareSimLogsEvents(left, right));

    const page = new SimLogsPage({
      listed: matched,
      limit: input.limit,
      nextToken: input.nextToken,
      maximumLimit,
    });

    return {
      $metadata: {},
      events: page.items,
      nextToken: page.nextToken,
    };
  }
}

/**
 * The streams a request searches: named ones, ones under a prefix, or all of
 * them.
 *
 * Real CloudWatch Logs refuses both selectors at once rather than deciding
 * which wins, so this does too. A name in `logStreamNames` that no stream has
 * is not an error there either; it simply contributes nothing.
 */
function searchedStreams(
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
    return group.streams.filter((stream) =>
      logStreamNames.includes(stream.logStreamName),
    );
  }

  return group.streams.filter((stream) =>
    stream.logStreamName.startsWith(logStreamNamePrefix ?? ""),
  );
}

function filteredEvents(
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
