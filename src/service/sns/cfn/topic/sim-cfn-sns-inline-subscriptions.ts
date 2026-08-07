import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnSnsResourceError } from "../sim-cfn-sns-resource-error.js";
import { snsTopicResourceType } from "../sim-cfn-sns-resource-types.js";
import { topicSubscriptionPropertyName } from "./sim-cfn-sns-topic-property-names.js";

/**
 * One entry of the `Subscription` list on an AWS::SNS::Topic.
 *
 * It carries the protocol and the endpoint and nothing else. A subscription
 * declared this way cannot have a filter policy or raw message delivery, which
 * is what the separate AWS::SNS::Subscription Resource is for.
 */
export interface SimCfnSnsInlineSubscription {
  readonly protocol: string;
  readonly endpoint: string;
}

/**
 * Read the `Subscription` property of an AWS::SNS::Topic.
 *
 * CDK emits a separate AWS::SNS::Subscription Resource for every subscription,
 * so this list is the hand-written template's way of writing the same thing.
 * Both end up going through Subscribe.
 */
export function simCfnSnsInlineSubscriptions(
  logicalId: string,
  value: SimCfnTemplateValue | undefined,
): readonly SimCfnSnsInlineSubscription[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw topicPropertyError(
      logicalId,
      `${topicSubscriptionPropertyName} must be a list of subscriptions`,
    );
  }

  return value.map((entry) => inlineSubscription(logicalId, entry));
}

function inlineSubscription(
  logicalId: string,
  entry: SimCfnTemplateValue,
): SimCfnSnsInlineSubscription {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw topicPropertyError(
      logicalId,
      `each entry of ${topicSubscriptionPropertyName} must be an object with ` +
        `a Protocol and an Endpoint`,
    );
  }

  return {
    protocol: requiredString(logicalId, entry["Protocol"], "Protocol"),
    endpoint: requiredString(logicalId, entry["Endpoint"], "Endpoint"),
  };
}

function requiredString(
  logicalId: string,
  value: SimCfnTemplateValue | undefined,
  name: string,
): string {
  if (typeof value !== "string") {
    throw topicPropertyError(
      logicalId,
      `each entry of ${topicSubscriptionPropertyName} requires ${name} to be a ` +
        `string`,
    );
  }

  return value;
}

function topicPropertyError(logicalId: string, reason: string): Error {
  return simCfnSnsResourceError(snsTopicResourceType, logicalId, reason);
}
