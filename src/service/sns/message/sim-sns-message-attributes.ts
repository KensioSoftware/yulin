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
   * What these attributes contribute to the size of a publish.
   */
  get byteSize(): number {
    return this.attributes.reduce(
      (total, attribute) => total + attribute.byteSize,
      0,
    );
  }
}
