import type { SimSqsMessage } from "../../message/sim-sqs-message.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";

/**
 * How long a FIFO receive can be retried under its attempt id: five minutes.
 */
const attemptLifetimeMilliseconds = 5 * 60 * 1000;

/**
 * One message a receive handed out, and the receipt handle it went out under.
 */
export interface SimSqsTakenMessage {
  readonly message: SimSqsMessage;
  readonly receiptHandle: string;
}

interface SimSqsReceiveAttempt {
  readonly startedAt: number;
  readonly taken: readonly SimSqsTakenMessage[];
  readonly hiddenUntil: readonly number[];
}

/**
 * The FIFO receives that can be retried by their `ReceiveRequestAttemptId`.
 *
 * Real SQS answers a retry within five minutes with the same messages and
 * receipt handles, and resets their visibility timeout, as long as none of
 * them has been deleted or had its visibility changed since. Otherwise the
 * retry is an ordinary receive. The attempts are held per queue here rather
 * than on the queue, since only a receive ever asks about them.
 */
export class SimSqsReceiveAttempts {
  private readonly attempts = new WeakMap<
    SimSqsQueue,
    Map<string, SimSqsReceiveAttempt>
  >();

  /**
   * The messages an earlier receive under the same attempt id handed out, if
   * it can be repeated now.
   */
  repeatable(
    queue: SimSqsQueue,
    attemptId: string | undefined,
    instant: Date,
  ): readonly SimSqsTakenMessage[] | undefined {
    if (attemptId === undefined) {
      return undefined;
    }

    const attempt = this.attempts.get(queue)?.get(attemptId);

    if (
      attempt === undefined ||
      attempt.startedAt + attemptLifetimeMilliseconds <= instant.getTime() ||
      !unchanged(queue, attempt)
    ) {
      return undefined;
    }

    return attempt.taken;
  }

  /**
   * Remember what a receive handed out under its attempt id, as of now.
   *
   * A retry that repeats a receive keeps the instant it was first made, so
   * the five minutes run from the original receive.
   */
  remember(
    queue: SimSqsQueue,
    attemptId: string | undefined,
    taken: readonly SimSqsTakenMessage[],
    instant: Date,
  ): void {
    if (attemptId === undefined) {
      return;
    }

    const held =
      this.attempts.get(queue) ?? new Map<string, SimSqsReceiveAttempt>();
    const startedAt = held.get(attemptId)?.startedAt ?? instant.getTime();

    held.set(attemptId, {
      startedAt,
      taken,
      hiddenUntil: taken.map(({ message }) => message.availableFrom.getTime()),
    });
    this.attempts.set(queue, held);
  }
}

/**
 * Whether every message an attempt took is still on the queue, under the same
 * receipt handle and hidden until the same instant.
 */
function unchanged(queue: SimSqsQueue, attempt: SimSqsReceiveAttempt): boolean {
  return attempt.taken.every(
    ({ message, receiptHandle }, index) =>
      queue.holdsMessage(message) &&
      message.holdsReceiptHandle(receiptHandle) &&
      message.availableFrom.getTime() === attempt.hiddenUntil.at(index),
  );
}
