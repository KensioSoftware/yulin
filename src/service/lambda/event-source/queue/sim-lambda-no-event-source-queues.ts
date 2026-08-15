import { SimSqsUnreachablePollQueues } from "../../../sqs/poll/sim-sqs-poll-queues.js";
import { SimLambdaError } from "../../error/sim-lambda.error.js";

/**
 * Event source queues used when no simulated SQS is wired up, such as for a
 * standalone SimLambda constructed outside SimAws.
 */
export class SimLambdaNoEventSourceQueues extends SimSqsUnreachablePollQueues {
  /**
   * Say that this SimLambda has no simulated SQS behind it, and how to give it
   * one.
   */
  protected override unreachable(queueArn: string): Error {
    return new SimLambdaError(
      `Cannot poll ${queueArn}: this SimLambda has no simulated SQS to poll. ` +
        "Create the event source mapping through SimAws, or construct " +
        "SimLambda with eventSourceQueues.",
    );
  }
}
