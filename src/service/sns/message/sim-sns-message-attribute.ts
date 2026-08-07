import {
  assertUsableSnsAttributeName,
  assertUsableSnsDataType,
  snsAttributeValueBytes,
} from "./sim-sns-message-attribute-rules.js";
import type { SimSnsMessageAttributeValue } from "./sim-sns-message-attribute-value.js";

/**
 * One validated message attribute of a published message.
 */
export class SimSnsMessageAttribute {
  public readonly name: string;
  public readonly dataType: string;
  public readonly value: Buffer;

  private constructor(name: string, dataType: string, value: Buffer) {
    this.name = name;
    this.dataType = dataType;
    this.value = value;
  }

  /**
   * Read one message attribute, refusing one real SNS would refuse.
   */
  static of(
    name: string,
    value: SimSnsMessageAttributeValue,
  ): SimSnsMessageAttribute {
    assertUsableSnsAttributeName(name);

    const dataType = value.DataType ?? "";

    assertUsableSnsDataType(name, dataType);

    return new this(
      name,
      dataType,
      snsAttributeValueBytes(name, dataType, value),
    );
  }

  /**
   * What this attribute contributes to the size of a publish.
   *
   * Real SNS counts message attributes against the same 256 KB a message body
   * is held to, and an attribute's name, data type and value all travel.
   */
  get byteSize(): number {
    return (
      Buffer.byteLength(this.name, "utf8") +
      Buffer.byteLength(this.dataType, "utf8") +
      this.value.length
    );
  }
}
