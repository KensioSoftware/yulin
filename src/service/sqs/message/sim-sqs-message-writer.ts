import { randomUUID } from "node:crypto";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import { SimSqsInvalidParameterValue } from "../error/sim-sqs.error.js";
import type { SimSqsAcceptedSend } from "../queue/sim-sqs-deduplication-window.js";
import type { SimSqsQueue } from "../queue/sim-sqs-queue.js";
import { SimSqsMessage } from "./sim-sqs-message.js";
import type { SimSqsMessageAttributes } from "./sim-sqs-message-attributes.js";
import { SimSqsMessageBody } from "./sim-sqs-message-body.js";
import { simSqsCheckedOrdering } from "./sim-sqs-message-ordering-rules.js";

const maximumDelaySeconds = 900;

const millisecondsPerSecond = 1000;

/**
 * One message as a sender describes it, with the request's own wrapping removed.
 */
export interface SimSqsMessageWrite {
  readonly body: string | undefined;
  readonly attributes: SimSqsMessageAttributes;
  readonly delaySeconds: number | undefined;

  /** The X-Ray trace header the message carries, if any. */
  readonly traceHeader?: string | undefined;

  /** The message group, which a FIFO queue requires. */
  readonly messageGroupId?: string | undefined;

  /** The sender's own deduplication id, which only a FIFO queue takes. */
  readonly deduplicationId?: string | undefined;
}

/**
 * What one write did: the message as it was sent, and what the send reports.
 *
 * The two differ for a FIFO duplicate. It reports the message id of the send
 * it duplicates, while the digests are of the body and attributes this send
 * carried, which is what the sender checks them against.
 */
export interface SimSqsWrittenMessage {
  readonly message: SimSqsMessage;
  readonly accepted: SimSqsAcceptedSend;
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
 * caller. The queue's type decides what a message group and a deduplication id
 * mean.
 */
export class SimSqsMessageWriter {
  private readonly clock: BackgroundScheduler;

  constructor(properties: SimSqsMessageWriterProperties) {
    this.clock = properties.clock;
  }

  /**
   * Write one message to a queue, and hand back what was written.
   */
  write(
    queue: SimSqsQueue,
    requested: SimSqsMessageWrite,
  ): SimSqsWrittenMessage {
    const sentAt = this.clock.now();
    const body = SimSqsMessageBody.of(
      requested.body ?? "",
      queue.attributes.maximumMessageSizeBytes,
    );
    const checked = simSqsCheckedOrdering(queue.attributes.fifo, {
      ...requested,
      body: body.value,
    });
    const delaySeconds = this.delayFor(queue, requested.delaySeconds);
    const message = new SimSqsMessage({
      messageId: randomUUID(),
      body,
      attributes: requested.attributes,
      traceHeader: requested.traceHeader,
      ordering: checked.ordering,
      sentAt,
      visibleFrom: new Date(
        sentAt.getTime() + delaySeconds * millisecondsPerSecond,
      ),
    });

    return {
      message,
      accepted: queue.intake.accept(message, checked.deduplicationKey, sentAt),
    };
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
