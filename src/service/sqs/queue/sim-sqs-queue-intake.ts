import type { SimSqsMessage } from "../message/sim-sqs-message.js";
import {
  type SimSqsAcceptedSend,
  SimSqsDeduplicationWindow,
  SimSqsSequenceNumbers,
} from "./sim-sqs-deduplication-window.js";

interface SimSqsQueueIntakeProperties {
  readonly fifo: boolean;
  readonly add: (message: SimSqsMessage) => void;
  readonly announce: (instant: Date) => void;
}

/**
 * How one queue takes in what is sent to it.
 *
 * A standard queue takes every message as it comes. A FIFO queue gives each
 * message a sequence number, and drops a message whose deduplication key it
 * has seen in the last five minutes, answering with the send it duplicates.
 */
export class SimSqsQueueIntake {
  private readonly window = new SimSqsDeduplicationWindow();
  private readonly sequenceNumbers = new SimSqsSequenceNumbers();
  private readonly fifo: boolean;
  private readonly add: (message: SimSqsMessage) => void;
  private readonly announce: (instant: Date) => void;

  /**
   * Take in messages for a standard queue, or a FIFO one when `fifo` is set,
   * handing what is to go on the queue to `add` and telling `announce` when a
   * message can be received.
   */
  constructor(properties: SimSqsQueueIntakeProperties) {
    this.fifo = properties.fifo;
    this.add = properties.add;
    this.announce = properties.announce;
  }

  /**
   * Note that a message has left the queue.
   *
   * On a FIFO queue that can unblock the next message of its group, so
   * watchers are told a message can be received now.
   */
  released(instant: Date): void {
    if (this.fifo) {
      this.announce(instant);
    }
  }

  /**
   * Take in a sent message, unless a FIFO queue has seen its deduplication key
   * in the last five minutes, and answer with what the send reports.
   *
   * Only a FIFO send carries a deduplication key, so only a FIFO send can be a
   * duplicate.
   */
  accept(
    message: SimSqsMessage,
    deduplicationKey: string | undefined,
    instant: Date,
  ): SimSqsAcceptedSend {
    if (deduplicationKey !== undefined) {
      const duplicated = this.window.duplicated(deduplicationKey, instant);

      if (duplicated !== undefined) {
        return duplicated;
      }
    }

    const stored = this.sequenced(message);
    const send = {
      messageId: stored.messageId,
      sequenceNumber: stored.ordering.sequenceNumber,
    };

    this.add(stored);

    if (deduplicationKey !== undefined) {
      this.window.remember(deduplicationKey, send, instant);
    }

    return send;
  }

  private sequenced(message: SimSqsMessage): SimSqsMessage {
    if (!this.fifo) {
      return message;
    }

    return message.withSequenceNumber(this.sequenceNumbers.next());
  }
}
