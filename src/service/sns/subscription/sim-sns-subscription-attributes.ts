import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";
import {
  assertSimSnsSettableSubscriptionAttribute,
  simSnsRawMessageDeliveryAttributeName,
} from "./sim-sns-subscription-attribute-names.js";

/**
 * Subscription attributes as a request carries them, which is always as
 * strings.
 */
export type SimSnsSubscriptionAttributeInput = Readonly<
  Record<string, string | undefined>
>;

/**
 * Read the one boolean attribute this simulation holds.
 *
 * Real SNS takes the two lower case spellings and refuses everything else, so a
 * request setting `RawMessageDelivery` to `True` or to `1` is refused rather
 * than quietly treated as false.
 */
function booleanValue(value: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new SimSnsInvalidParameterException(
    `Invalid parameter: AttributeValue: ${simSnsRawMessageDeliveryAttributeName}` +
      ` must be true or false, and this one is ${value}`,
  );
}

/**
 * The attributes of one simulated subscription that a request can set.
 *
 * Applying a request makes a new set rather than changing this one, so a
 * request naming an attribute this simulation will not take leaves the
 * subscription as it was.
 */
export class SimSnsSubscriptionAttributes {
  public readonly rawMessageDelivery: boolean;

  private constructor(rawMessageDelivery: boolean) {
    this.rawMessageDelivery = rawMessageDelivery;
  }

  /**
   * The attributes a subscription has before anything sets one.
   *
   * Real SNS reports `RawMessageDelivery` as false for a subscription created
   * without it, rather than leaving the attribute out, which is why it is held
   * rather than being absent until set.
   */
  static defaults(): SimSnsSubscriptionAttributes {
    return new this(false);
  }

  /**
   * These attributes with a request's changes applied.
   *
   * Every name is checked before any value is read, so a request naming one
   * attribute this simulation will not take changes none of them.
   */
  with(
    requested: SimSnsSubscriptionAttributeInput,
  ): SimSnsSubscriptionAttributes {
    const named = Object.entries(requested).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    );

    for (const [name] of named) {
      assertSimSnsSettableSubscriptionAttribute(name);
    }

    const raw = named.find(
      ([name]) => name === simSnsRawMessageDeliveryAttributeName,
    )?.[1];

    if (raw === undefined) {
      return this;
    }

    return new SimSnsSubscriptionAttributes(booleanValue(raw));
  }

  /**
   * Add these attributes to what SNS reports about the subscription.
   */
  reportInto(reported: Map<string, string>): void {
    reported.set(
      simSnsRawMessageDeliveryAttributeName,
      String(this.rawMessageDelivery),
    );
  }
}
