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
   * Whether this attribute carries bytes rather than text.
   *
   * The data type says which: `Binary` and anything under it carries bytes, and
   * `String` and `Number` and their custom types carry text.
   */
  get isBinary(): boolean {
    return this.hasDataType("Binary");
  }

  /**
   * Whether this attribute carries a number.
   *
   * A number still arrives as text, since that is all a message attribute
   * carries. The data type is what says the text means a number, which is what
   * a filter policy needs before it can compare one numerically.
   */
  get isNumber(): boolean {
    return this.hasDataType("Number");
  }

  /**
   * Whether this attribute carries a JSON array of values in its text.
   *
   * A filter policy matches any member of one, which is what the data type is
   * for: `String.Array` is a list rather than a string that looks like one.
   */
  get isStringArray(): boolean {
    return this.hasDataType("String.Array");
  }

  /**
   * This attribute as the SNS envelope reports it.
   *
   * The envelope is JSON, so a binary value travels base64 encoded, which is
   * what real SNS does with one.
   */
  get envelopeValue(): string {
    return this.value.toString(this.isBinary ? "base64" : "utf8");
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

  /**
   * Whether the data type is one of the four, with or without a custom label.
   */
  private hasDataType(base: string): boolean {
    return this.dataType === base || this.dataType.startsWith(`${base}.`);
  }
}
