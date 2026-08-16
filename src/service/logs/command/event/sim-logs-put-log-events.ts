import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimLogsEventBatch } from "../../event/sim-logs-event-batch.js";
import type { SimLogsEventIds } from "../../event/sim-logs-event-ids.js";
import { requiredSimLogsLogGroupName } from "../../group/sim-logs-log-group-name.js";
import type { SimLogsLogGroupStore } from "../../group/sim-logs-log-group-store.js";
import { requiredSimLogsLogStreamName } from "../../stream/sim-logs-log-stream-name.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import type {
  SimPutLogEventsCommand,
  SimPutLogEventsCommandOutput,
} from "./event.command.js";

interface SimLogsPutLogEventsProperties {
  readonly groups: SimLogsLogGroupStore;
  readonly authorizer: SimLogsAuthorizer;
  readonly eventIds: SimLogsEventIds;
  readonly clock: SimClock;
}

/**
 * The command that writes log events to a stream.
 */
export class SimLogsPutLogEvents {
  readonly #groups: SimLogsLogGroupStore;
  readonly #authorizer: SimLogsAuthorizer;
  readonly #eventIds: SimLogsEventIds;
  readonly #clock: SimClock;

  constructor(properties: SimLogsPutLogEventsProperties) {
    this.#groups = properties.groups;
    this.#authorizer = properties.authorizer;
    this.#eventIds = properties.eventIds;
    this.#clock = properties.clock;
  }

  /**
   * Write a batch of events to a stream in a log group.
   *
   * Neither the group nor the stream is made on the way: real CloudWatch Logs
   * refuses a write to either one that is not there, which is what makes a
   * missing `logs:CreateLogStream` permission show up as a failure rather than
   * as logs that quietly never appear.
   */
  handle(
    command: SimPutLogEventsCommand,
    options?: SimLogsRequestOptions,
  ): SimPutLogEventsCommandOutput {
    const input = command.input;
    const logGroupName = requiredSimLogsLogGroupName(input.logGroupName);
    const logStreamName = requiredSimLogsLogStreamName(input.logStreamName);

    this.#authorizer.authorizeLogGroup(
      "logs:PutLogEvents",
      logGroupName,
      options?.caller,
    );

    const ingestionTime = this.#clock.now().getTime();
    const batch = new SimLogsEventBatch({
      events: input.logEvents,
      eventIds: this.#eventIds,
      ingestionTime,
    });

    const stream = this.#groups
      .require(logGroupName)
      .requireStream(logStreamName);

    stream.append(batch.events, ingestionTime);

    return { $metadata: {}, nextSequenceToken: stream.uploadSequenceToken };
  }
}
