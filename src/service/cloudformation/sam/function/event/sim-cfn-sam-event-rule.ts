import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samPickedProperties } from "../../sim-cfn-sam-picked.js";
import { samEventStateProperty } from "./sim-cfn-sam-event-state.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-function-events.js";

interface SamEventRuleProperties {
  readonly event: SamFunctionEvent;
  /**
   * What makes the rule fire, as the property that carries it. An event on a
   * timer states a `ScheduleExpression`, and one matching events states an
   * `EventPattern`.
   */
  readonly trigger: SimCfnTemplateValueRecord;
}

/**
 * The properties an event and a rule name the same thing, so expanding them is
 * carrying them across.
 */
const carriedProperties = new Set(["Description", "EventBusName"]);

/**
 * The Resources an event fired by an EventBridge rule is expanded into.
 *
 * The rule holds the function as its one inline target, and the permission
 * beside it is what lets EventBridge invoke it. Without the permission the
 * rule matches, the delivery is refused, and the function never runs.
 *
 * Both are named after the function and the event, so a function with two
 * events of its own gets a rule for each. They are conditioned the way the
 * function is, since a function the template conditioned out has nothing for a
 * rule to invoke.
 */
export function samEventRuleResources(
  properties: SamEventRuleProperties,
): Record<string, SimCfnTemplateValue> {
  const { event, trigger } = properties;
  const prefix = `${event.functionLogicalId}${event.eventName}`;
  const ruleLogicalId = `${prefix}Rule`;

  return {
    [ruleLogicalId]: {
      Type: "AWS::Events::Rule",
      ...event.condition,
      Properties: {
        ...trigger,
        ...samEventRuleName(event.properties),
        ...samPickedProperties(event.properties, carriedProperties),
        ...samEventStateProperty(event.properties),
        Targets: [samEventRuleTarget(event, prefix)],
      },
    },
    [`${prefix}Permission`]: samEventRulePermission(event, ruleLogicalId),
  };
}

/**
 * The `Name` the rule is created under, for an event naming one.
 *
 * A `Schedule` event calls it `Name` and an `EventBridgeRule` event calls it
 * `RuleName`, and both are the name of the same rule. An event naming neither
 * gets the name CloudFormation generates from the stack and the logical ID.
 */
function samEventRuleName(
  properties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const name = properties["Name"] ?? properties["RuleName"];

  return name === undefined ? {} : { Name: name };
}

/**
 * The rule's one target, which is the function the event was declared on.
 *
 * `Input` is the fixed JSON the target receives in place of the event. A
 * scheduled function usually wants one, since a schedule has nothing to say
 * beyond having fallen due.
 */
function samEventRuleTarget(
  event: SamFunctionEvent,
  prefix: string,
): SimCfnTemplateValueRecord {
  return {
    Id: `${prefix}Target`,
    Arn: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
    ...samPickedProperties(event.properties, new Set(["Input"])),
  };
}

/**
 * The AWS::Lambda::Permission the rule invokes the function under.
 *
 * A rule reaches a function as the `events.amazonaws.com` service principal,
 * and the function's own resource policy is what admits it. The grant is
 * scoped to this rule's ARN, so it is the rule the event made rather than
 * EventBridge at large that may invoke the function.
 */
function samEventRulePermission(
  event: SamFunctionEvent,
  ruleLogicalId: string,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::Lambda::Permission",
    ...event.condition,
    Properties: {
      Action: "lambda:InvokeFunction",
      FunctionName: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
      Principal: "events.amazonaws.com",
      SourceArn: { "Fn::GetAtt": [ruleLogicalId, "Arn"] },
    },
  };
}
