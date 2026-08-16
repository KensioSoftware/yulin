import { SimLogsInvalidParameterException } from "../../error/sim-logs.error.js";
import { simLogsEventsInWindow } from "../../event/sim-logs-event-window.js";
import { requiredSimLogsLogGroupName } from "../../group/sim-logs-log-group-name.js";
import type { SimLogsLogGroupStore } from "../../group/sim-logs-log-group-store.js";
import { requiredSimLogsLogStreamName } from "../../stream/sim-logs-log-stream-name.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import { SimLogsEventCursor } from "./sim-logs-event-cursor.js";
import type {
  SimGetLogEventsCommand,
  SimGetLogEventsCommandOutput,
} from "./event.command.js";

const maximumLimit = 10_000;

interface SimLogsGetLogEventsProperties {
  readonly groups: SimLogsLogGroupStore;
  readonly authorizer: SimLogsAuthorizer;
}

/**
 * The command that reads the events of one log stream.
 */
export class SimLogsGetLogEvents {
  readonly #groups: SimLogsLogGroupStore;
  readonly #authorizer: SimLogsAuthorizer;

  constructor(properties: SimLogsGetLogEventsProperties) {
    this.#groups = properties.groups;
    this.#authorizer = properties.authorizer;
  }

  /**
   * Read one stream's events, oldest first.
   */
  handle(
    command: SimGetLogEventsCommand,
    options?: SimLogsRequestOptions,
  ): SimGetLogEventsCommandOutput {
    const input = command.input;
    const logGroupName = requiredSimLogsLogGroupName(input.logGroupName);
    const logStreamName = requiredSimLogsLogStreamName(input.logStreamName);

    this.#authorizer.authorizeLogGroup(
      "logs:GetLogEvents",
      logGroupName,
      options?.caller,
    );

    const stream = this.#groups
      .require(logGroupName)
      .requireStream(logStreamName);

    const events = simLogsEventsInWindow(stream.events, input);
    const cursor = new SimLogsEventCursor({
      eventCount: events.length,
      limit: requiredLimit(input.limit),
      startFromHead: input.startFromHead ?? false,
      nextToken: input.nextToken,
    });

    return {
      $metadata: {},
      events: events
        .slice(cursor.startIndex, cursor.endIndex)
        .map(({ timestamp, ingestionTime, message }) => ({
          timestamp,
          ingestionTime,
          message,
        })),
      nextForwardToken: cursor.nextForwardToken,
      nextBackwardToken: cursor.nextBackwardToken,
    };
  }
}

function requiredLimit(requested: number | undefined): number {
  const limit = requested ?? maximumLimit;

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximumLimit) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value '${String(requested)}' at 'limit' ` +
        `failed to satisfy constraint: Member must be between 1 and ` +
        `${maximumLimit}`,
    );
  }

  return limit;
}
