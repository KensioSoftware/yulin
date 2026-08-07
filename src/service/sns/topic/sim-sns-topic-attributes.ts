import {
  assertSimSnsSettableAttribute,
  simSnsDisplayNameAttributeName,
  simSnsPolicyAttributeName,
} from "./sim-sns-topic-attribute-names.js";
import { SimSnsTopicPolicy } from "./sim-sns-topic-policy.js";

/**
 * Topic attributes as a request carries them, which is always as strings.
 */
export type SimSnsTopicAttributeInput = Readonly<
  Record<string, string | undefined>
>;

interface SimSnsTopicAttributesProperties {
  readonly displayName: string;
  readonly policy: SimSnsTopicPolicy | undefined;
}

/**
 * The attributes of one simulated topic that a request can set.
 *
 * Real SNS has many more, and this simulation refuses the ones it gives no
 * behaviour to rather than holding them, so what is here is what does
 * something. The display name is carried because SNS reports it whether or not
 * it has been set, and the policy is carried because it is the topic's resource
 * policy.
 *
 * Applying a request makes a new set rather than changing this one, so a
 * request that turns out to name an attribute this simulation will not take
 * leaves the topic as it was.
 */
export class SimSnsTopicAttributes {
  public readonly displayName: string;
  public readonly policy: SimSnsTopicPolicy | undefined;

  private constructor(properties: SimSnsTopicAttributesProperties) {
    this.displayName = properties.displayName;
    this.policy = properties.policy;
  }

  /**
   * The attributes a topic has before anything sets one.
   *
   * Real SNS reports an empty display name for a topic created without one,
   * rather than leaving the attribute out.
   */
  static defaults(): SimSnsTopicAttributes {
    return new this({ displayName: "", policy: undefined });
  }

  /**
   * These attributes with a request's changes applied.
   *
   * Every name is checked before any value is read, so a request naming one
   * attribute this simulation will not take changes none of them.
   */
  with(requested: SimSnsTopicAttributeInput): SimSnsTopicAttributes {
    const named = Object.entries(requested).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    );

    for (const [name] of named) {
      assertSimSnsSettableAttribute(name);
    }

    return new SimSnsTopicAttributes({
      displayName: this.displayNameAfter(named),
      policy: this.policyAfter(named),
    });
  }

  /**
   * Add these attributes to what SNS reports about the topic.
   *
   * The display name is always reported, as real SNS reports it. The policy is
   * reported only once one has been set, since a topic without one has no value
   * for the attribute.
   */
  reportInto(reported: Map<string, string>): void {
    reported.set(simSnsDisplayNameAttributeName, this.displayName);

    if (this.policy !== undefined) {
      reported.set(simSnsPolicyAttributeName, this.policy.value);
    }
  }

  private displayNameAfter(named: readonly [string, string][]): string {
    return (
      this.valueIn(named, simSnsDisplayNameAttributeName) ?? this.displayName
    );
  }

  /**
   * The policy these attributes hold after a request.
   *
   * An empty string takes the policy off the topic, which is how SNS is told to
   * remove one: there is no DeleteTopicPolicy, so setting the attribute to
   * nothing is the only way back to a topic without one.
   */
  private policyAfter(
    named: readonly [string, string][],
  ): SimSnsTopicPolicy | undefined {
    const value = this.valueIn(named, simSnsPolicyAttributeName);

    if (value === undefined) {
      return this.policy;
    }

    if (value === "") {
      return undefined;
    }

    return SimSnsTopicPolicy.parse(value);
  }

  private valueIn(
    named: readonly [string, string][],
    name: string,
  ): string | undefined {
    return named.find(([key]) => key === name)?.[1];
  }
}
