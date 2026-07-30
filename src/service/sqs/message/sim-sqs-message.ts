import type { SimSqsMessageAttributes } from "./sim-sqs-message-attributes.js";
import type { SimSqsMessageBody } from "./sim-sqs-message-body.js";
import { SimSqsMessageVisibility } from "./sim-sqs-message-visibility.js";

const millisecondsPerSecond = 1000;

interface SimSqsMessageProperties {
  readonly messageId: string;
  readonly body: SimSqsMessageBody;
  readonly attributes: SimSqsMessageAttributes;
  readonly sentAt: Date;
  readonly visibleFrom: Date;
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

  private readonly visibility: SimSqsMessageVisibility;
  private receiptHandle: string | undefined;

  constructor(properties: SimSqsMessageProperties) {
    this.messageId = properties.messageId;
    this.body = properties.body;
    this.attributes = properties.attributes;
    this.sentAt = properties.sentAt;
    this.visibility = new SimSqsMessageVisibility(properties.visibleFrom);
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
   * Whether the queue's retention period has run out for this message.
   *
   * Retention runs from when the message was sent, however many times it has been
   * received since.
   */
  hasExpiredBy(instant: Date, retentionSeconds: number): boolean {
    return (
      this.sentAt.getTime() + retentionSeconds * millisecondsPerSecond <=
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
   * The message system attributes SQS knows about this message.
   *
   * Only the attributes a receive request names are reported, so this is what is
   * available rather than what is returned.
   */
  systemAttributeValues(): ReadonlyMap<string, string> {
    return new Map<string, string>([
      ["SentTimestamp", String(this.sentAt.getTime())],
      ["ApproximateReceiveCount", String(this.visibility.receiveCount)],
      [
        "ApproximateFirstReceiveTimestamp",
        String(this.visibility.firstReceived.getTime()),
      ],
    ]);
  }
}
