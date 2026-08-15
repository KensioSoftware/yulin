/**
 * One message attribute as a queue reports it.
 */
export interface SimSqsPollMessageAttribute {
  readonly DataType?: string | undefined;
  readonly StringValue?: string | undefined;
  readonly BinaryValue?: Uint8Array | undefined;
  readonly StringListValues?: readonly string[] | undefined;
  readonly BinaryListValues?: readonly Uint8Array[] | undefined;
}

/**
 * One message as a queue hands it to a poller.
 *
 * These are the queue's own field names rather than any consumer's: what a
 * poller receives is a message, and turning it into whatever the consumer
 * expects, such as a Lambda SQS event record, is the consumer's job.
 */
export interface SimSqsPollMessage {
  readonly MessageId: string;
  readonly ReceiptHandle: string;
  readonly MD5OfBody: string;
  readonly Body: string;
  readonly Attributes?: Record<string, string> | undefined;
  readonly MessageAttributes?:
    | Record<string, SimSqsPollMessageAttribute>
    | undefined;
}
