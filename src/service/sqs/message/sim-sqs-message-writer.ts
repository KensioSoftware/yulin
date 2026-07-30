import { randomUUID } from "node:crypto";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import { SimSqsInvalidParameterValue } from "../error/sim-sqs.error.js";
import type { SimSqsQueue } from "../queue/sim-sqs-queue.js";
import { SimSqsMessage } from "./sim-sqs-message.js";
import type { SimSqsMessageAttributes } from "./sim-sqs-message-attributes.js";
import { SimSqsMessageBody } from "./sim-sqs-message-body.js";

const maximumDelaySeconds = 900;

const millisecondsPerSecond = 1000;

/**
 * One message as a sender describes it, with the request's own wrapping removed.
 */
export interface SimSqsMessageWrite {
  readonly body: string | undefined;
  readonly attributes: SimSqsMessageAttributes;
  readonly delaySeconds: number | undefined;
}

interface SimSqsMessageWriterProperties {
  readonly clock: BackgroundScheduler;
}

/**
 * Puts a message on a queue.
 *
 * SendMessage and each entry of SendMessageBatch end up here, so the two cannot
 * drift apart on what a delay means, on how large a body may be, or on what a
 * message id looks like. The queue's own attributes decide all three, which is
 * why the queue comes in with the write rather than being consulted by the
 * caller.
 */
export class SimSqsMessageWriter {
  private readonly clock: BackgroundScheduler;

  constructor(properties: SimSqsMessageWriterProperties) {
    this.clock = properties.clock;
  }

  /**
   * Write one message to a queue, and hand back what was written.
   */
  write(queue: SimSqsQueue, requested: SimSqsMessageWrite): SimSqsMessage {
    const sentAt = this.clock.now();
    const delaySeconds = this.delayFor(queue, requested.delaySeconds);
    const message = new SimSqsMessage({
      messageId: randomUUID(),
      body: SimSqsMessageBody.of(
        requested.body ?? "",
        queue.attributes.maximumMessageSizeBytes,
      ),
      attributes: requested.attributes,
      sentAt,
      visibleFrom: new Date(
        sentAt.getTime() + delaySeconds * millisecondsPerSecond,
      ),
    });

    queue.add(message);

    return message;
  }

  /**
   * The delay a message waits out before it can be received.
   *
   * A message with no delay of its own takes the queue's, which is what makes
   * `DelaySeconds` on the queue a delay every message inherits.
   */
  private delayFor(queue: SimSqsQueue, requested: number | undefined): number {
    if (requested === undefined) {
      return queue.attributes.delaySeconds;
    }

    if (
      !Number.isSafeInteger(requested) ||
      requested < 0 ||
      requested > maximumDelaySeconds
    ) {
      throw new SimSqsInvalidParameterValue(
        `Value ${String(requested)} for parameter DelaySeconds is invalid. ` +
          `Reason: Must be an integer from 0 to ${String(maximumDelaySeconds)}.`,
      );
    }

    return requested;
  }
}
