import type { BackgroundScheduler } from "../../../../util/background/background.js";
import {
  SimSqsInvalidParameterValue,
  SimSqsReceiptHandleIsInvalid,
  SimSqsValidationException,
} from "../../error/sim-sqs.error.js";
import type { SimSqsMessage } from "../../message/sim-sqs-message.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";

interface SimSqsMessageHandlesProperties {
  readonly clock: BackgroundScheduler;
}

/**
 * How a request reaches the message a receipt handle names.
 *
 * Deleting a message and changing its visibility both start here, and both have
 * to tell three cases apart: a handle the queue never issued, a handle it did
 * issue for a message that has since been received again, and the handle from the
 * most recent receive. Only the first is a failure.
 */
export class SimSqsMessageHandles {
  private readonly clock: BackgroundScheduler;

  constructor(properties: SimSqsMessageHandlesProperties) {
    this.clock = properties.clock;
  }

  /**
   * The receipt handle a request has to carry.
   */
  static required(receiptHandle: string | undefined): string {
    if (receiptHandle === undefined || receiptHandle === "") {
      throw new SimSqsValidationException(
        "The request must contain the parameter ReceiptHandle",
      );
    }

    return receiptHandle;
  }

  /**
   * The message a receipt handle names, refusing a handle the queue never issued.
   */
  message(queue: SimSqsQueue, receiptHandle: string): SimSqsMessage {
    const message = queue.messageForHandle(receiptHandle, this.clock.now());

    if (message === undefined) {
      throw new SimSqsReceiptHandleIsInvalid(
        `The receipt handle '${receiptHandle}' is not a receipt handle this ` +
          `queue issued`,
      );
    }

    return message;
  }

  /**
   * Refuse a FIFO queue's receipt handle once its visibility timeout has
   * lapsed.
   *
   * A standard queue accepts a stale handle and does nothing with it. A FIFO
   * queue fails the request instead, since the message may already be with
   * the next consumer of its group, and real SQS reports the handle as
   * expired.
   */
  assertUnexpired(
    queue: SimSqsQueue,
    message: SimSqsMessage,
    receiptHandle: string,
  ): void {
    if (!queue.name.isFifo) {
      return;
    }

    if (
      !message.holdsReceiptHandle(receiptHandle) ||
      !message.isInFlightAt(this.clock.now())
    ) {
      throw new SimSqsInvalidParameterValue(
        `Value ${receiptHandle} for parameter ReceiptHandle is invalid. ` +
          `Reason: The receipt handle has expired.`,
      );
    }
  }
}
