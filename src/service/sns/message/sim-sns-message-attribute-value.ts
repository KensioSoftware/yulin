/**
 * One message attribute as a publish request carries it.
 *
 * https://docs.aws.amazon.com/sns/latest/api/API_MessageAttributeValue.html
 */
export interface SimSnsMessageAttributeValue {
  readonly DataType?: string | undefined;
  readonly StringValue?: string | undefined;
  readonly BinaryValue?: Uint8Array | undefined;
}

/**
 * Message attributes as a publish request carries them.
 */
export type SimSnsMessageAttributeInput = Readonly<
  Record<string, SimSnsMessageAttributeValue | undefined>
>;
