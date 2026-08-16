import { compareSimLogsEvents } from "../../event/sim-logs-event.js";
import { SimLogsFilterPattern } from "../../event/sim-logs-filter-pattern.js";
import { requiredSimLogsLogGroupName } from "../../group/sim-logs-log-group-name.js";
import type { SimLogsLogGroupStore } from "../../group/sim-logs-log-group-store.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import { SimLogsPage } from "../sim-logs-page.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import {
  filteredSimLogsEvents,
  searchedSimLogsStreams,
} from "./sim-logs-searched-events.js";
import type {
  SimFilterLogEventsCommand,
  SimFilterLogEventsCommandOutput,
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
    const matched = searchedSimLogsStreams(group, input)
      .flatMap((stream) => filteredSimLogsEvents(stream, input, pattern))
      .toSorted((left, right) => compareSimLogsEvents(left, right));

    const page = new SimLogsPage({
      listed: matched,
      limit: input.limit,
      nextToken: input.nextToken,
      maximumLimit,
    });

    return { $metadata: {}, events: page.items, nextToken: page.nextToken };
  }
}
