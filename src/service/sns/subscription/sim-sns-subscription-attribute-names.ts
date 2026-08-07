import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../error/sim-sns.error.js";

/**
 * Whether the subscription receives the published message on its own rather
 * than wrapped in the SNS envelope.
 *
 * This is the subscription attribute a consumer breaks on: code written for the
 * envelope reads `JSON.parse(body).Message`, and code written for raw delivery
 * reads `body`.
 */
export const simSnsRawMessageDeliveryAttributeName = "RawMessageDelivery";

/**
 * The JSON document saying which messages the subscription wants.
 */
export const simSnsFilterPolicyAttributeName = "FilterPolicy";

/**
 * What part of a published message the filter policy is matched against.
 */
export const simSnsFilterPolicyScopeAttributeName = "FilterPolicyScope";

const settableAttributeNames = new Set([
  simSnsRawMessageDeliveryAttributeName,
  simSnsFilterPolicyAttributeName,
  simSnsFilterPolicyScopeAttributeName,
]);

/**
 * The other attributes real SNS lets a request set on a subscription.
 *
 * Each is refused by name with the reason rather than taken and ignored. A
 * subscription that appeared to accept a `RedrivePolicy` would drop a failed
 * delivery while a test believed it was keeping it, which is exactly the kind
 * of pass that means nothing.
 */
const unsimulatedAttributeNames = new Map<string, string>([
  ["DeliveryPolicy", "Delivery retry policies are not simulated."],
  [
    "RedrivePolicy",
    "Subscription dead-letter queues are not simulated, so a message that " +
      "could not be delivered goes nowhere.",
  ],
  [
    "SubscriptionRoleArn",
    "Amazon Data Firehose delivery is not simulated, and that is the only " +
      "protocol this attribute applies to.",
  ],
  ["ReplayPolicy", "Message archiving and replay are not simulated."],
]);

/**
 * Refuse a subscription attribute this simulation cannot set.
 *
 * An attribute real SNS has and this simulation does not is refused with the
 * reason. An attribute real SNS does not have at all is refused the way real
 * SNS refuses it.
 */
export function assertSimSnsSettableSubscriptionAttribute(name: string): void {
  if (settableAttributeNames.has(name)) {
    return;
  }

  const reason = unsimulatedAttributeNames.get(name);

  if (reason !== undefined) {
    throw new SimSnsUnsimulatedInputException(
      `The subscription attribute ${name} is not simulated. ${reason}`,
    );
  }

  throw new SimSnsInvalidParameterException(
    `Invalid parameter: AttributeName: ${name} is not a subscription ` +
      `attribute that can be set`,
  );
}
