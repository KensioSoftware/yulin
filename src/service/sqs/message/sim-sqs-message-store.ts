import type { SimSqsMessage } from "./sim-sqs-message.js";

/**
 * How many messages a queue holds in each of the states SQS counts separately.
 */
export interface SimSqsMessageCounts {
  readonly visible: number;
  readonly inFlight: number;
  readonly delayed: number;
}

/**
 * The messages of one simulated queue, and the receipt handles it has issued.
 *
 * Handles are kept here rather than on the messages because a handle outlives
 * the message it names: a consumer deleting an already deleted message is
 * accepted by real SQS, and a handle the queue never issued is not. Only a store
 * of what has been issued can tell those two apart.
 */
export class SimSqsMessageStore {
  private messages: readonly SimSqsMessage[] = [];
  private readonly handles = new Map<string, SimSqsMessage>();

  /**
   * Take a newly sent message.
   */
  add(message: SimSqsMessage): void {
    this.messages = [...this.messages, message];
  }

  /**
   * Forget the messages whose retention period has run out.
   *
   * Real SQS drops a message once it has been on the queue longer than the
   * retention period, so advancing simulated time past it loses the message here
   * too rather than keeping it forever.
   */
  dropExpired(instant: Date, retentionSeconds: number): void {
    this.messages = this.messages.filter(
      (message) => !message.hasExpiredBy(instant, retentionSeconds),
    );
  }

  /**
   * The messages that can be received at an instant, oldest first.
   */
  receivable(instant: Date, limit: number): readonly SimSqsMessage[] {
    return this.messages
      .filter((message) => message.isVisibleAt(instant))
      .slice(0, limit);
  }

  /**
   * Record that a message was handed out under a receipt handle.
   */
  recordHandle(receiptHandle: string, message: SimSqsMessage): void {
    this.handles.set(receiptHandle, message);
  }

  /**
   * The message a receipt handle names, or undefined for a handle this queue
   * never issued.
   */
  forHandle(receiptHandle: string): SimSqsMessage | undefined {
    return this.handles.get(receiptHandle);
  }

  /**
   * Forget a deleted message.
   */
  remove(message: SimSqsMessage): void {
    this.messages = this.messages.filter((held) => held !== message);
  }

  /**
   * Forget every message, as PurgeQueue does.
   */
  purge(): void {
    this.messages = [];
  }

  /**
   * How many messages are in each state at an instant.
   */
  countsAt(instant: Date): SimSqsMessageCounts {
    return {
      visible: this.countWhere((message) => message.isVisibleAt(instant)),
      inFlight: this.countWhere((message) => message.isInFlightAt(instant)),
      delayed: this.countWhere((message) => message.isDelayedAt(instant)),
    };
  }

  private countWhere(matches: (message: SimSqsMessage) => boolean): number {
    return this.messages.filter((message) => matches(message)).length;
  }
}
