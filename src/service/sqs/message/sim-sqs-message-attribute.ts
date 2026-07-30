import type { SimSqsMessageAttributePayload } from "./sim-sqs-message-attribute-payload.js";
import {
  assertUsableAttributeName,
  assertUsableDataType,
  attributePayload,
} from "./sim-sqs-message-attribute-rules.js";
import type { SimSqsMessageAttributeValue } from "./sim-sqs-message-attribute-value.js";

const lengthPrefixBytes = 4;

/**
 * One digest field: a four byte big-endian length, then the bytes themselves.
 */
function lengthPrefixed(bytes: Buffer): Buffer {
  const length = Buffer.alloc(lengthPrefixBytes);

  length.writeUInt32BE(bytes.length);

  return Buffer.concat([length, bytes]);
}

/**
 * One validated message attribute.
 */
export class SimSqsMessageAttribute {
  public readonly name: string;
  public readonly dataType: string;

  private readonly payload: SimSqsMessageAttributePayload;

  private constructor(
    name: string,
    dataType: string,
    payload: SimSqsMessageAttributePayload,
  ) {
    this.name = name;
    this.dataType = dataType;
    this.payload = payload;
  }

  /**
   * Read one message attribute, refusing one real SQS would refuse.
   */
  static of(
    name: string,
    value: SimSqsMessageAttributeValue,
  ): SimSqsMessageAttribute {
    assertUsableAttributeName(name);

    const dataType = value.DataType ?? "";

    assertUsableDataType(name, dataType);

    return new this(name, dataType, attributePayload(name, dataType, value));
  }

  /**
   * This attribute as SQS reports it in a response.
   */
  reported(): SimSqsMessageAttributeValue {
    return this.payload.reported(this.dataType);
  }

  /**
   * The bytes this attribute contributes to a message attribute digest.
   *
   * Real SQS digests message attributes in a defined encoding: the name, then the
   * data type, each as a big-endian length followed by its UTF-8 bytes, then a
   * byte saying whether the value travels as text or as bytes, then the value in
   * the same length-prefixed form. Reproducing it is what makes
   * `MD5OfMessageAttributes` a digest a caller can check rather than a token.
   */
  digestBytes(): Buffer {
    return Buffer.concat([
      lengthPrefixed(Buffer.from(this.name, "utf8")),
      lengthPrefixed(Buffer.from(this.dataType, "utf8")),
      Buffer.of(this.payload.transportType),
      lengthPrefixed(this.payload.bytes),
    ]);
  }
}
