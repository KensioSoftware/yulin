import { SimSnsMessageAttribute } from "./sim-sns-message-attribute.js";
import type {
  SimSnsMessageAttributeInput,
  SimSnsMessageAttributeValue,
} from "./sim-sns-message-attribute-value.js";

/**
 * The message attributes of one published message.
 *
 * They are held as a set rather than one at a time because that is how they are
 * asked about: what a publish weighs is the whole set, and a subscription
 * filter policy matches against the whole set.
 */
export class SimSnsMessageAttributes {
  private readonly attributes: readonly SimSnsMessageAttribute[];

  private constructor(attributes: readonly SimSnsMessageAttribute[]) {
    this.attributes = attributes;
  }

  /**
   * Read the message attributes of a request, refusing any real SNS would
   * refuse.
   */
  static of(
    input: SimSnsMessageAttributeInput | undefined,
  ): SimSnsMessageAttributes {
    const attributes = Object.entries(input ?? {})
      .filter(
        (entry): entry is [string, SimSnsMessageAttributeValue] =>
          entry[1] !== undefined,
      )
      .map(([name, value]) => SimSnsMessageAttribute.of(name, value));

    return new this(attributes);
  }

  /**
   * Each attribute on its own.
   *
   * A subscription filter policy reads them one at a time, because what a
   * policy can match depends on the data type each one declares.
   */
  get all(): readonly SimSnsMessageAttribute[] {
    return this.attributes;
  }

  /**
   * One attribute by name, where the message carries it.
   *
   * SMS is what needs this. Real SNS reads `AWS.SNS.SMS.SenderID` and
   * `AWS.SNS.SMS.SMSType` out of the attributes of a publish to a phone
   * number, so a recorded SMS reads them back the same way.
   */
  find(name: string): SimSnsMessageAttribute | undefined {
    return this.attributes.find((attribute) => attribute.name === name);
  }

  /**
   * What these attributes contribute to the size of a publish.
   */
  get byteSize(): number {
    return this.attributes.reduce(
      (total, attribute) => total + attribute.byteSize,
      0,
    );
  }

  /**
   * Whether there are any attributes at all.
   *
   * A message published without attributes carries no `MessageAttributes` in
   * its envelope, rather than an empty object, which is what real SNS does.
   */
  get isEmpty(): boolean {
    return this.attributes.length === 0;
  }

  /**
   * These attributes as the SNS envelope reports them.
   *
   * The envelope names the data type `Type` and the value `Value`, which is not
   * the shape a publish request carries them in, nor the shape SQS carries
   * them in.
   */
  inEnvelope(): Record<string, SimSnsEnvelopeMessageAttribute> {
    return Object.fromEntries(
      this.attributes.map((attribute) => [
        attribute.name,
        { Type: attribute.dataType, Value: attribute.envelopeValue },
      ]),
    );
  }

  /**
   * These attributes as SQS message attributes.
   *
   * A subscription with raw message delivery turned on has its attributes moved
   * onto the SQS message rather than left in an envelope there is no longer
   * one of.
   */
  asSqsAttributes(): Record<string, SimSnsSqsMessageAttribute> {
    return Object.fromEntries(
      this.attributes.map((attribute) => [
        attribute.name,
        {
          DataType: attribute.dataType,
          ...(attribute.isBinary
            ? { BinaryValue: Uint8Array.from(attribute.value) }
            : { StringValue: attribute.value.toString("utf8") }),
        },
      ]),
    );
  }
}

/**
 * One message attribute as the SNS envelope reports it.
 */
export interface SimSnsEnvelopeMessageAttribute {
  readonly Type: string;
  readonly Value: string;
}

/**
 * One message attribute as an SQS message carries it.
 *
 * This is the SQS shape rather than the SNS one: the data type is `DataType`,
 * and the value is under the name of the form it takes.
 */
export interface SimSnsSqsMessageAttribute {
  readonly DataType: string;
  readonly StringValue?: string | undefined;
  readonly BinaryValue?: Uint8Array | undefined;
}
