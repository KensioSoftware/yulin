import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord, samValueList } from "../../sim-cfn-sam-record.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-declared-event.js";
import type { SamResourceEdit } from "./sim-cfn-sam-resource-edit.js";
import { samTriggeredUserPool } from "./sim-cfn-sam-triggered-user-pool.js";

/**
 * What a `Cognito` event asks of the pool it names.
 */
interface SamCognitoTrigger {
  /** The logical ID of the user pool the event names. */
  readonly userPoolLogicalId: string;
  /** The `LambdaConfig` keys the event's `Trigger` names. */
  readonly triggers: readonly string[];
}

/**
 * The Resource a `Cognito` event expands into, which is the permission the
 * pool invokes the function under.
 *
 * A user pool checks the function's resource policy every time a trigger
 * fires, so the entry in its `LambdaConfig` is not enough on its own. The
 * grant names the pool as the source, so a permission written for one pool
 * does not open the function to another.
 *
 * The pool is not made to depend on the permission. Cognito reads the policy
 * when the trigger fires rather than when the pool is created, and a pool
 * depending on a permission that names the pool is the circular dependency
 * CloudFormation refuses.
 */
export function samCognitoEventResources(
  event: SamFunctionEvent,
): Record<string, SimCfnTemplateValue> {
  const trigger = samCognitoTrigger(event);

  if (trigger === undefined) {
    return {};
  }

  return {
    [`${event.functionLogicalId}${event.eventName}CognitoPermission`]: {
      Type: "AWS::Lambda::Permission",
      ...event.condition,
      Properties: {
        Action: "lambda:InvokeFunction",
        FunctionName: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
        Principal: "cognito-idp.amazonaws.com",
        SourceArn: { "Fn::GetAtt": [trigger.userPoolLogicalId, "Arn"] },
      },
    },
  };
}

/**
 * The change a `Cognito` event makes to the user pool the template already
 * declares.
 *
 * A trigger is a property of the pool, so this is the second event type with
 * no Resource of its own to be.
 */
export function samCognitoEventEdits(
  event: SamFunctionEvent,
): readonly SamResourceEdit[] {
  const trigger = samCognitoTrigger(event);

  if (trigger === undefined) {
    return [];
  }

  return [
    {
      logicalId: trigger.userPoolLogicalId,
      edit: (resource) =>
        samTriggeredUserPool(event, trigger.triggers, resource),
    },
  ];
}

/**
 * What the event asks of the pool, or nothing where it named no pool or no
 * trigger.
 *
 * Either one missing leaves the function as it is rather than failing the
 * deployment, the same answer an event of a type nothing expands gets.
 *
 * `UserPool` is the logical ID of a pool of this template, written as the name
 * or as a `Ref` to it, which is what SAM accepts. A pool named any other way is
 * a pool this cannot reach to put a trigger on.
 */
function samCognitoTrigger(
  event: SamFunctionEvent,
): SamCognitoTrigger | undefined {
  const userPoolLogicalId = logicalIdOf(event.properties["UserPool"]);
  const triggers = triggerNames(event.properties["Trigger"]);

  if (userPoolLogicalId === undefined || triggers.length === 0) {
    return undefined;
  }

  return { userPoolLogicalId, triggers };
}

function logicalIdOf(
  userPool: SimCfnTemplateValue | undefined,
): string | undefined {
  if (typeof userPool === "string") {
    return userPool;
  }

  const reference = isSamTemplateRecord(userPool) ? userPool["Ref"] : undefined;

  return typeof reference === "string" ? reference : undefined;
}

/**
 * The triggers the event names, which SAM states as one name or as a list.
 */
function triggerNames(trigger: SimCfnTemplateValue | undefined): string[] {
  if (typeof trigger === "string") {
    return [trigger];
  }

  return samValueList(trigger).filter((name) => typeof name === "string");
}
