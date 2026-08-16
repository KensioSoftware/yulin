import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { requiredSimLogsLogGroupName } from "../../group/sim-logs-log-group-name.js";
import type { SimLogsLogGroupStore } from "../../group/sim-logs-log-group-store.js";
import type { SimLogsLogStream } from "../../stream/sim-logs-log-stream.js";
import { requiredSimLogsLogStreamName } from "../../stream/sim-logs-log-stream-name.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import { SimLogsPage } from "../sim-logs-page.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import { orderedSimLogsLogStreams } from "./sim-logs-log-stream-order.js";
import type {
  SimCreateLogStreamCommand,
  SimCreateLogStreamCommandOutput,
  SimDescribeLogStreamsCommand,
  SimDescribeLogStreamsCommandOutput,
  SimLogsLogStreamDetail,
} from "./stream.command.js";

const maximumDescribeLimit = 50;

interface SimLogsLogStreamCommandsProperties {
  readonly groups: SimLogsLogGroupStore;
  readonly authorizer: SimLogsAuthorizer;
  readonly clock: SimClock;
}

/**
 * The commands that make and describe log streams.
 */
export class SimLogsLogStreamCommands {
  readonly #groups: SimLogsLogGroupStore;
  readonly #authorizer: SimLogsAuthorizer;
  readonly #clock: SimClock;

  constructor(properties: SimLogsLogStreamCommandsProperties) {
    this.#groups = properties.groups;
    this.#authorizer = properties.authorizer;
    this.#clock = properties.clock;
  }

  /**
   * Make a stream in a log group.
   */
  createLogStream(
    command: SimCreateLogStreamCommand,
    options?: SimLogsRequestOptions,
  ): SimCreateLogStreamCommandOutput {
    const logGroupName = requiredSimLogsLogGroupName(command.input.logGroupName);
    const logStreamName = requiredSimLogsLogStreamName(
      command.input.logStreamName,
    );

    this.#authorizer.authorizeLogGroup(
      "logs:CreateLogStream",
      logGroupName,
      options?.caller,
    );

    this.#groups
      .require(logGroupName)
      .createStream(logStreamName, this.#clock.now().getTime());

    return { $metadata: {} };
  }

  /**
   * Describe the streams in a log group.
   */
  describeLogStreams(
    command: SimDescribeLogStreamsCommand,
    options?: SimLogsRequestOptions,
  ): SimDescribeLogStreamsCommandOutput {
    const input = command.input;
    const logGroupName = requiredSimLogsLogGroupName(input.logGroupName);

    this.#authorizer.authorizeLogGroup(
      "logs:DescribeLogStreams",
      logGroupName,
      options?.caller,
    );

    const group = this.#groups.require(logGroupName);
    const matching = group.streams.filter((stream) =>
      stream.logStreamName.startsWith(input.logStreamNamePrefix ?? ""),
    );

    const page = new SimLogsPage({
      listed: orderedSimLogsLogStreams(matching, input),
      limit: input.limit,
      nextToken: input.nextToken,
      maximumLimit: maximumDescribeLimit,
    });

    return {
      $metadata: {},
      logStreams: page.items.map((stream) => logStreamDetail(stream)),
      nextToken: page.nextToken,
    };
  }
}

function logStreamDetail(stream: SimLogsLogStream): SimLogsLogStreamDetail {
  return {
    logStreamName: stream.logStreamName,
    creationTime: stream.creationTime,
    firstEventTimestamp: stream.firstEventTimestamp,
    lastEventTimestamp: stream.lastEventTimestamp,
    lastIngestionTime: stream.lastIngestionTime,
    uploadSequenceToken: stream.uploadSequenceToken,
    arn: stream.arn,
    storedBytes: 0,
  };
}
