import type { SimSqsMessageAttributes } from "./sim-sqs-message-attributes.js";
import type { SimSqsMessageBody } from "./sim-sqs-message-body.js";
import { SimSqsMessageVisibility } from "./sim-sqs-message-visibility.js";
import { simSqsMessageSystemValues } from "./sim-sqs-message-system-values.js";

const millisecondsPerSecond = 1000;

/**
 * What places a message in order on a FIFO queue, and what a FIFO queue
 * deduplicates it by.
 *
 * A standard queue takes a message group too, for fair queueing, and none of
 * the other two.
 */
export interface SimSqsMessageOrdering {
  readonly messageGroupId?: string | undefined;
  readonly deduplicationId?: string | undefined;
  readonly sequenceNumber?: string | undefined;
}

interface SimSqsMessageProperties {
  readonly messageId: string;
  readonly body: SimSqsMessageBody;
  readonly attributes: SimSqsMessageAttributes;
  readonly sentAt: Date;
  readonly visibleFrom: Date;
  readonly ordering: SimSqsMessageOrdering;
  readonly deadLetterSourceArn?: string | undefined;
  readonly traceHeader?: string | undefined;

  /**
   * When retention starts from, which is when the message was sent unless it
   * was moved to a FIFO dead-letter queue since.
   */
  readonly enqueuedAt?: Date | undefined;
}

/**
 * How a message is moved to a dead-letter queue.
 */
export interface SimSqsDeadLetterMoveOf {
  readonly instant: Date;
  readonly sourceQueueArn: string;
  readonly toFifoQueue: boolean;
}

/**
 * One message on a simulated queue.
 *
 * What the message is stays here; whether it can be received belongs to its
 * visibility, which is the part that changes as it is handed out and given back.
 */
export class SimSqsMessage {
  public readonly messageId: string;
  public readonly body: SimSqsMessageBody;
  public readonly attributes: SimSqsMessageAttributes;
  public readonly sentAt: Date;
  public readonly ordering: SimSqsMessageOrdering;

  private readonly enqueuedAt: Date;
  private readonly visibility: SimSqsMessageVisibility;
  private readonly deadLetterSourceArn: string | undefined;
  private readonly traceHeader: string | undefined;
  private receiptHandle: string | undefined;

  constructor(properties: SimSqsMessageProperties) {
    this.messageId = properties.messageId;
    this.body = properties.body;
    this.attributes = properties.attributes;
    this.sentAt = properties.sentAt;
    this.enqueuedAt = properties.enqueuedAt ?? properties.sentAt;
    this.ordering = properties.ordering;
    this.visibility = new SimSqsMessageVisibility(properties.visibleFrom);
    this.deadLetterSourceArn = properties.deadLetterSourceArn;
    this.traceHeader = properties.traceHeader;
  }

  /**
   * How many times this message has been handed out without being deleted.
   */
  get receiveCount(): number {
    return this.visibility.receiveCount;
  }

  /**
   * The instant from which this message can be received.
   *
   * A message sent with a delay is not receivable when it arrives, so anything
   * waiting for it has to wait for this rather than for the send.
   */
  get availableFrom(): Date {
    return this.visibility.availableFrom;
  }

  /**
   * Whether this message can be received at an instant.
   */
  isVisibleAt(instant: Date): boolean {
    return this.visibility.isVisibleAt(instant);
  }

  /**
   * Whether this message is still waiting out the delay it was sent with.
   */
  isDelayedAt(instant: Date): boolean {
    return this.visibility.isDelayedAt(instant);
  }

  /**
   * Whether this message is hidden by a visibility timeout, which SQS counts as
   * in flight.
   */
  isInFlightAt(instant: Date): boolean {
    return this.visibility.isInFlightAt(instant);
  }

  /**
   * The message group this message belongs to, if any.
   */
  get messageGroupId(): string | undefined {
    return this.ordering.messageGroupId;
  }

  /**
   * Whether the queue's retention period has run out for this message.
   *
   * Retention runs from when the message was sent, however many times it has been
   * received since. A move to a FIFO dead-letter queue starts it again.
   */
  hasExpiredBy(instant: Date, retentionSeconds: number): boolean {
    return (
      this.enqueuedAt.getTime() + retentionSeconds * millisecondsPerSecond <=
      instant.getTime()
    );
  }

  /**
   * Hand this message out, hiding it for its visibility timeout.
   */
  receiveAt(
    instant: Date,
    visibilityTimeoutSeconds: number,
    receiptHandle: string,
  ): void {
    this.receiptHandle = receiptHandle;
    this.visibility.receiveAt(instant, visibilityTimeoutSeconds);
  }

  /**
   * Hide this message for a visibility timeout starting now.
   */
  hideFor(instant: Date, visibilityTimeoutSeconds: number): void {
    this.visibility.hideFor(instant, visibilityTimeoutSeconds);
  }

  /**
   * Whether a receipt handle is the one this message was last received with.
   *
   * An older handle is not. Real SQS accepts a request carrying one and does
   * nothing, because the receive it belongs to has been superseded.
   */
  holdsReceiptHandle(receiptHandle: string): boolean {
    return this.receiptHandle === receiptHandle;
  }

  /**
   * This message as it arrives on a dead-letter queue.
   *
   * What the message is carries over unchanged: the id, the body, the message
   * attributes, the sent timestamp and its place in its message group. Real
   * SQS leaves the enqueue timestamp alone when it moves a message to a
   * standard queue, so retention still runs from when the message was first
   * sent. A move to a FIFO queue restarts retention, and replaces the
   * deduplication id with the message id, as real SQS does, so two messages
   * that shared an id on the source queue are both kept.
   *
   * What does not carry over is the receive count, because a receive count
   * counts receives from one queue and this message has not been received from
   * this one. It is receivable straight away: the move is not a send, so the
   * dead-letter queue's delay does not apply to it.
   */
  onDeadLetterQueue(move: SimSqsDeadLetterMoveOf): SimSqsMessage {
    const { instant, sourceQueueArn, toFifoQueue } = move;

    return new SimSqsMessage({
      messageId: this.messageId,
      body: this.body,
      attributes: this.attributes,
      sentAt: this.sentAt,
      ...this.afterMove(instant, toFifoQueue),
      visibleFrom: instant,
      deadLetterSourceArn: sourceQueueArn,
      traceHeader: this.traceHeader,
    });
  }

  /**
   * This message as a FIFO queue stores it, carrying the sequence number the
   * queue gave it. It is called on a message that has not been received yet.
   */
  withSequenceNumber(sequenceNumber: string): SimSqsMessage {
    return new SimSqsMessage({
      messageId: this.messageId,
      body: this.body,
      attributes: this.attributes,
      sentAt: this.sentAt,
      visibleFrom: this.availableFrom,
      ordering: { ...this.ordering, sequenceNumber },
      traceHeader: this.traceHeader,
    });
  }

  /**
   * The message system attributes SQS knows about this message.
   *
   * Only the attributes a receive request names are reported, so this is what is
   * available rather than what is returned.
   */
  systemAttributeValues(): ReadonlyMap<string, string> {
    return simSqsMessageSystemValues({
      sentAt: this.sentAt,
      receiveCount: this.visibility.receiveCount,
      firstReceived: this.visibility.firstReceived,
      deadLetterSourceArn: this.deadLetterSourceArn,
      traceHeader: this.traceHeader,
      ordering: this.ordering,
    });
  }

  /**
   * When retention runs from, and the ordering, for this message on a
   * dead-letter queue.
   */
  private afterMove(
    instant: Date,
    toFifoQueue: boolean,
  ): { enqueuedAt: Date; ordering: SimSqsMessageOrdering } {
    if (!toFifoQueue) {
      return { enqueuedAt: this.enqueuedAt, ordering: this.ordering };
    }

    return {
      enqueuedAt: instant,
      ordering: { ...this.ordering, deduplicationId: this.messageId },
    };
  }
}
