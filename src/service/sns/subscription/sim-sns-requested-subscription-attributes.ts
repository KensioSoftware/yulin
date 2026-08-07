import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";
import { assertSimSnsSettableSubscriptionAttribute } from "./sim-sns-subscription-attribute-names.js";

/**
 * Subscription attributes as a request carries them, which is always as
 * strings.
 */
export type SimSnsSubscriptionAttributeInput = Readonly<
  Record<string, string | undefined>
>;

/**
 * The attributes one request names, with the ones it left out left out.
 *
 * Every name is checked as this is read, so a request naming one attribute this
 * simulation will not take changes none of them.
 */
export class SimSnsRequestedSubscriptionAttributes {
  private readonly named: ReadonlyMap<string, string>;

  constructor(requested: SimSnsSubscriptionAttributeInput) {
    const named = Object.entries(requested).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    );

    for (const [name] of named) {
      assertSimSnsSettableSubscriptionAttribute(name);
    }

    this.named = new Map(named);
  }

  /**
   * What the request set an attribute to, if it named it at all.
   */
  value(name: string): string | undefined {
    return this.named.get(name);
  }

  /**
   * Read an attribute the request set to a boolean.
   *
   * Real SNS takes the two lower case spellings and refuses everything else, so
   * a request setting `RawMessageDelivery` to `True` or to `1` is refused
   * rather than quietly treated as false.
   */
  booleanValue(name: string): boolean | undefined {
    const value = this.value(name);

    if (value === undefined) {
      return undefined;
    }

    if (value === "true" || value === "false") {
      return value === "true";
    }

    throw new SimSnsInvalidParameterException(
      `Invalid parameter: AttributeValue: ${name} must be true or false, and ` +
        `this one is ${value}`,
    );
  }
}
