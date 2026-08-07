import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnSnsResourceError } from "../sim-cfn-sns-resource-error.js";
import { snsTopicResourceType } from "../sim-cfn-sns-resource-types.js";
import { topicSubscriptionPropertyName } from "./sim-cfn-sns-topic-property-names.js";

const protocolKey = "Protocol";

const endpointKey = "Endpoint";

/**
 * One entry of the `Subscription` list on an AWS::SNS::Topic.
 *
 * It carries the protocol and the endpoint and nothing else, which is all real
 * CloudFormation lets one carry. A subscription declared this way therefore
 * cannot have a filter policy or raw message delivery, and an entry asking for
 * either is refused rather than deployed without it. That is what the separate
 * AWS::SNS::Subscription Resource is for.
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

  const fields = new Map(Object.entries(entry));

  for (const name of fields.keys()) {
    if (name !== protocolKey && name !== endpointKey) {
      throw topicPropertyError(
        logicalId,
        `an entry of ${topicSubscriptionPropertyName} carries ${name}, and ` +
          `the only things one can carry are ${protocolKey} and ${endpointKey}`,
      );
    }
  }

  return {
    protocol: requiredString(logicalId, fields.get(protocolKey), protocolKey),
    endpoint: requiredString(logicalId, fields.get(endpointKey), endpointKey),
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
