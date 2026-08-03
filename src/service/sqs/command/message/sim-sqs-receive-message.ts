import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimSqsRequestOptions } from "../sim-sqs-request-options.js";
import type { SimSqsQueueAccess } from "../queue/sim-sqs-queue-access.js";
import type {
  SimReceiveMessageCommand,
  SimReceiveMessageCommandOutput,
} from "./receive.command.js";
import { SimSqsReceiveRequest } from "./sim-sqs-receive-request.js";

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
    const received = queue.receivable(receivedAt, request.messageCount);

    return {
      $metadata: {},
      Messages: request.taken(queue, received, receivedAt),
    };
  }
}
