import type { SimSqsMessageAttributeValue } from "./sim-sqs-message-attribute-value.js";

/**
 * The value of one message attribute.
 *
 * An attribute carries text or bytes and never both, so the two are separate
 * implementations rather than one shape with two optional fields. That is what
 * lets the digest and the reported form be stated without either of them asking
 * which kind it is holding.
 */
export interface SimSqsMessageAttributePayload {
  /**
   * The byte real SQS digests this kind of value under.
   */
  readonly transportType: number;

  /**
   * The value's bytes, as they go into a message attribute digest.
   */
  readonly bytes: Buffer;

  /**
   * This value as SQS reports it, alongside its data type.
   */
  reported(dataType: string): SimSqsMessageAttributeValue;
}

/**
 * A message attribute value travelling as text, which is what a String or
 * Number data type means.
 */
export class SimSqsStringPayload implements SimSqsMessageAttributePayload {
  public readonly transportType = 1;
  public readonly bytes: Buffer;

  private readonly value: string;

  constructor(value: string) {
    this.value = value;
    this.bytes = Buffer.from(value, "utf8");
  }

  /**
   * This value as SQS reports it, alongside its data type.
   */
  reported(dataType: string): SimSqsMessageAttributeValue {
    return { DataType: dataType, StringValue: this.value };
  }
}

/**
 * A message attribute value travelling as bytes.
 */
export class SimSqsBinaryPayload implements SimSqsMessageAttributePayload {
  public readonly transportType = 2;
  public readonly bytes: Buffer;

  /**
   * The bytes are copied on the way in and again on the way out, so a sent
   * message does not share an array with the sender or with a consumer. Real SQS
   * holds bytes a caller cannot reach afterwards, and a simulation that handed
   * the same array back would let a mutation reach across a send.
   */
  constructor(value: Uint8Array) {
    this.bytes = Buffer.from(value);
  }

  /**
   * This value as SQS reports it, alongside its data type.
   */
  reported(dataType: string): SimSqsMessageAttributeValue {
    return { DataType: dataType, BinaryValue: Uint8Array.from(this.bytes) };
  }
}
