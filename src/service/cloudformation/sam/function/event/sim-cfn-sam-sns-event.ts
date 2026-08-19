import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samRecordWithout } from "../../sim-cfn-sam-record.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-function-events.js";

/**
 * Expand one `SNS` event into the subscription that delivers the topic's
 * messages to the function.
 *
 * The subscription is the function itself rather than a queue in front of it,
 * so the protocol is `lambda` and the endpoint is the function's ARN. SNS
 * consults the function's resource policy on every delivery, so the permission
 * admitting SNS comes with it. Without one the topic has a subscription it
 * cannot deliver to.
 *
 * Everything the event states beside `Topic` goes onto the subscription under
 * the name it already carries, which is how `FilterPolicy` and its scope
 * arrive. `SqsSubscription`, which asks for a queue between the two, is not a
 * subscription property and is refused by the subscription rather than
 * silently deploying the direct delivery the event did not ask for.
 *
 * An event naming no topic expands into nothing, the way a mapping with no
 * source does.
 */
export function samSnsEventResources(
  event: SamFunctionEvent,
): Record<string, SimCfnTemplateValue> {
  const topic = event.properties["Topic"];

  if (topic === undefined) {
    return {};
  }

  const prefix = `${event.functionLogicalId}${event.eventName}Sns`;

  return {
    [`${prefix}Subscription`]: subscriptionResource(event, topic),
    [`${prefix}Permission`]: permissionResource(event, topic),
  };
}

function subscriptionResource(
  event: SamFunctionEvent,
  topic: SimCfnTemplateValue,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::SNS::Subscription",
    ...event.condition,
    Properties: {
      ...samRecordWithout(event.properties, "Topic"),
      TopicArn: topic,
      Protocol: "lambda",
      Endpoint: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
    },
  };
}

/**
 * The AWS::Lambda::Permission the topic invokes the function under, granted
 * for that topic alone.
 */
function permissionResource(
  event: SamFunctionEvent,
  topic: SimCfnTemplateValue,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::Lambda::Permission",
    ...event.condition,
    Properties: {
      Action: "lambda:InvokeFunction",
      FunctionName: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
      Principal: "sns.amazonaws.com",
      SourceArn: topic,
    },
  };
}
