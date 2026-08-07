/**
 * One published message and one subscription filter policy, which is all a
 * question about matching needs.
 *
 * This lives under `test/` for the same reasons as `test/sns/topic-fixture.ts`:
 * eslint rejects a test file that exports helpers alongside its own `describe`
 * calls, and `test/**` is type-checked with everything else, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */

import { assertThrowsError } from "@kensio/smartass";

import type { JSONObject } from "../../src/util/type-guard/json.js";
import type {
  SimSnsMessageAttributeInput,
  SimSnsMessageAttributeValue,
} from "../../src/service/sns/message/sim-sns-message-attribute-value.js";
import { SimSnsMessageAttributes } from "../../src/service/sns/message/sim-sns-message-attributes.js";
import { SimSnsPublishedMessage } from "../../src/service/sns/message/sim-sns-published-message.js";
import { SimSnsSubscriptionAttributes } from "../../src/service/sns/subscription/sim-sns-subscription-attributes.js";

/**
 * One published message, with whatever a test is asking about on it.
 */
export function simSnsPublishedMessage(
  body: string,
  attributes: SimSnsMessageAttributeInput = {},
): SimSnsPublishedMessage {
  return SimSnsPublishedMessage.of(
    {
      message: body,
      subject: undefined,
      attributes: SimSnsMessageAttributes.of(attributes),
    },
    new Date(),
  );
}

/**
 * A subscription holding one filter policy, of either scope.
 */
export function simSnsFilteringSubscription(
  policy: JSONObject,
  scope?: string,
): SimSnsSubscriptionAttributes {
  return SimSnsSubscriptionAttributes.defaults().with({
    FilterPolicy: JSON.stringify(policy),
    ...(scope !== undefined && { FilterPolicyScope: scope }),
  });
}

/**
 * Whether a policy of the default scope matches a message's attributes.
 */
export function simSnsFilterMatchesAttributes(
  policy: JSONObject,
  attributes: SimSnsMessageAttributeInput,
): boolean {
  return simSnsFilteringSubscription(policy).accepts(
    simSnsPublishedMessage("order-1", attributes),
  );
}

/**
 * Whether a policy of the `MessageBody` scope matches a message body.
 */
export function simSnsFilterMatchesBody(
  policy: JSONObject,
  body: string,
): boolean {
  return simSnsFilteringSubscription(policy, "MessageBody").accepts(
    simSnsPublishedMessage(body),
  );
}

/**
 * Set a filter policy that will not be taken, answering with what it threw.
 */
export function simSnsFilterPolicyRefusal(
  policy: JSONObject,
  scope?: string,
): Error {
  return assertThrowsError(() => simSnsFilteringSubscription(policy, scope));
}

/**
 * Set subscription attributes that will not be taken, answering with what they
 * threw.
 */
export function simSnsSubscriptionAttributeRefusal(
  requested: Record<string, string>,
  held = SimSnsSubscriptionAttributes.defaults(),
): Error {
  return assertThrowsError(() => held.with(requested));
}

/**
 * A `String` message attribute of a value, which is the ordinary case.
 */
export function simSnsStringAttribute(
  value: string,
): SimSnsMessageAttributeValue {
  return { DataType: "String", StringValue: value };
}

/**
 * A `Number` message attribute, which is the one a numeric match applies to.
 */
export function simSnsNumberAttribute(
  value: string,
): SimSnsMessageAttributeValue {
  return { DataType: "Number", StringValue: value };
}
