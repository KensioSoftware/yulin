import type { SimSqsPollQueues } from "../../sqs/poll/sim-sqs-poll-queues.js";
import type { SimLambdaEventSourceArn } from "./sim-lambda-event-source-arn.js";
import type { SimLambdaEventSourceStreams } from "./stream/sim-lambda-event-source-streams.js";

interface SimLambdaEventSourceReachableProperties {
  readonly queues: SimSqsPollQueues;
  readonly streams: SimLambdaEventSourceStreams;
}

/**
 * Reads the event source a mapping names, as the function's execution role.
 *
 * Real Lambda looks at the source when the mapping is created rather than
 * finding out at the first poll, because a mapping on a source that is not
 * there looks like a working subscription and delivers nothing. The read is the
 * one the poller will make, so it fails for the same reasons: the source is
 * missing, or the role may not read it.
 */
export class SimLambdaEventSourceReachable {
  private readonly queues: SimSqsPollQueues;
  private readonly streams: SimLambdaEventSourceStreams;

  constructor(properties: SimLambdaEventSourceReachableProperties) {
    this.queues = properties.queues;
    this.streams = properties.streams;
  }

  /**
   * Refuse a mapping whose event source cannot be read as the execution role.
   */
  async assertReachable(
    roleArn: string,
    eventSourceArn: SimLambdaEventSourceArn,
  ): Promise<void> {
    const caller = { kind: "arn", arn: roleArn } as const;

    switch (eventSourceArn.kind) {
      case "sqs": {
        await this.queues.visibilityTimeoutSeconds({
          queueArn: eventSourceArn.value,
          caller,
        });

        return;
      }

      case "dynamodb-stream": {
        await this.streams.tableName({
          streamArn: eventSourceArn.value,
          caller,
        });

        return;
      }
    }
  }
}
