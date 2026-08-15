import { SimSqsCommandPollQueues } from "../../../sqs/poll/sim-sqs-command-poll-queues.js";
import type { SimSqsPollQueueRequest } from "../../../sqs/poll/sim-sqs-poll-queues.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";

/**
 * Simulated SQS as the queues a Lambda event source mapping polls.
 *
 * The polling itself is the shared one every simulated consumer of a queue
 * makes. What is Lambda's own is what a queue that is not there means: real
 * Lambda reads the source when a mapping is created, and reports one it cannot
 * find as an invalid event source rather than as an SQS error.
 */
export class SimSqsEventSourceQueues extends SimSqsCommandPollQueues {
  private static queueLookupError(error: unknown, queueArn: string): unknown {
    if (error instanceof Error && error.name === "QueueDoesNotExist") {
      return new SimLambdaInvalidParameterValueException(
        `The event source ${queueArn} does not exist`,
        { cause: error },
      );
    }

    return error;
  }

  /**
   * How long a received message stays hidden, reporting a queue that is not
   * there the way real Lambda reports an event source it cannot reach.
   */
  override async visibilityTimeoutSeconds(
    request: SimSqsPollQueueRequest,
  ): Promise<number> {
    try {
      return await super.visibilityTimeoutSeconds(request);
    } catch (error) {
      throw SimSqsEventSourceQueues.queueLookupError(error, request.queueArn);
    }
  }
}
