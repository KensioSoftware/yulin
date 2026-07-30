/**
 * One message attribute as a request carries it and a response reports it.
 *
 * https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_MessageAttributeValue.html
 */
export interface SimSqsMessageAttributeValue {
  readonly DataType?: string | undefined;
  readonly StringValue?: string | undefined;
  readonly BinaryValue?: Uint8Array | undefined;
  readonly StringListValues?: readonly string[] | undefined;
  readonly BinaryListValues?: readonly Uint8Array[] | undefined;
}

/**
 * Message attributes as a request carries them.
 */
export type SimSqsMessageAttributeInput = Readonly<
  Record<string, SimSqsMessageAttributeValue | undefined>
>;
