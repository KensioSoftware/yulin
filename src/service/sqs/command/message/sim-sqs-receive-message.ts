import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimSqsRequestOptions } from "../sim-sqs-request-options.js";
import type { SimSqsQueueAccess } from "../queue/sim-sqs-queue-access.js";
import type {
  SimReceiveMessageCommand,
  SimReceiveMessageCommandOutput,
} from "./receive.command.js";
import {
  SimSqsReceiveAttempts,
  type SimSqsTakenMessage,
} from "./sim-sqs-receive-attempts.js";
import { SimSqsReceiveRequest } from "./sim-sqs-receive-request.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";

interface SimSqsReceiveMessageProperties {
  readonly access: SimSqsQueueAccess;
  readonly clock: BackgroundScheduler;
}

/**
 * The ReceiveMessage command.
 *
 * Receiving hides each message it hands out for the visibility timeout, so the
 * same message does not come back to a second consumer while the first is still
 * working on it. Nothing is scheduled to release it: the message records the
 * instant it is hidden until, and it becomes receivable again when simulated
 * time reaches it. Advancing the clock is therefore all a test has to do to
 * watch an undeleted message come back.
 */
export class SimSqsReceiveMessage {
  private readonly access: SimSqsQueueAccess;
  private readonly clock: BackgroundScheduler;
  private readonly attempts = new SimSqsReceiveAttempts();

  constructor(properties: SimSqsReceiveMessageProperties) {
    this.access = properties.access;
    this.clock = properties.clock;
  }

  /**
   * Receive up to `MaxNumberOfMessages` messages, hiding each of them.
   */
  handle(
    command: SimReceiveMessageCommand,
    options?: SimSqsRequestOptions,
  ): SimReceiveMessageCommandOutput {
    const queue = this.access.requireByUrl(
      "sqs:ReceiveMessage",
      command.input.QueueUrl,
      options,
    );
    const request = SimSqsReceiveRequest.of(command.input, queue);
    const receivedAt = this.clock.now();
    const taken = this.take(queue, request, receivedAt);

    this.attempts.remember(queue, request.attemptId, taken, receivedAt);

    return { $metadata: {}, Messages: request.reported(taken) };
  }

  /**
   * Take what an earlier receive under the same attempt id took, when it can be
   * repeated, and otherwise whatever the queue can hand out now.
   */
  private take(
    queue: SimSqsQueue,
    request: SimSqsReceiveRequest,
    receivedAt: Date,
  ): readonly SimSqsTakenMessage[] {
    const repeated = this.attempts.repeatable(
      queue,
      request.attemptId,
      receivedAt,
    );

    if (repeated !== undefined) {
      return request.retaken(queue, repeated, receivedAt);
    }

    const found = queue.receivable(receivedAt, request.messageCount);

    return request.taken(queue, found, receivedAt);
  }
}
