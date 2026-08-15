import { SimSqsUnreachablePollQueues } from "../../../sqs/poll/sim-sqs-poll-queues.js";
import { SimEcsError } from "../../error/sim-ecs.error.js";

/**
 * The queues a simulated ECS built on its own can consume, which is none.
 *
 * Simulated ECS is usually built through a SimAws instance, which hands it that
 * simulation's SQS. One built by itself has no queue to poll, so a container
 * bound to consume one says so rather than polling forever and delivering
 * nothing.
 */
export class SimEcsUnreachableConsumerQueues extends SimSqsUnreachablePollQueues {
  /**
   * Say that this simulated ECS has no simulated SQS behind it.
   */
  protected override unreachable(queueArn: string): Error {
    return new SimEcsError(
      `Cannot consume ${queueArn}: this simulated ECS reaches no simulated ` +
        `SQS. Build it through a SimAws instance to have a container consume ` +
        `a queue.`,
    );
  }
}
