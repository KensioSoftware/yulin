import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samPropertyError } from "../../sim-cfn-sam-error.js";
import { isSamTemplateRecord, samRecordAt } from "../../sim-cfn-sam-record.js";
import { samFunctionType } from "../sim-cfn-sam-function-type.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-declared-event.js";

/**
 * The user pool with an event's triggers on it.
 *
 * What the pool already declared is kept, so a template naming some of its
 * triggers by hand keeps them and two events on one pool both arrive.
 *
 * A trigger the pool already names a function for is refused. The pool runs
 * one function per trigger, so the alternative is a template whose two
 * declarations disagree and whose deployment silently picks one.
 */
export function samTriggeredUserPool(
  event: SamFunctionEvent,
  triggers: readonly string[],
  resource: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const properties = samRecordAt(resource, "Properties");
  const declared = declaredLambdaConfig(event, properties);

  return {
    ...resource,
    Properties: {
      ...properties,
      LambdaConfig: {
        ...declared,
        ...Object.fromEntries(
          triggers.map((name) => [name, functionArn(event, declared, name)]),
        ),
      },
    },
  };
}

/**
 * The `LambdaConfig` the pool already carries.
 *
 * One written as anything but a block of triggers is refused rather than
 * replaced, since adding to it would drop what it holds. A `LambdaConfig`
 * written as an intrinsic is a block as far as this can tell, and the event's
 * triggers go on beside it for the pool to refuse the unresolved key by name.
 */
function declaredLambdaConfig(
  event: SamFunctionEvent,
  properties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const declared = properties["LambdaConfig"];

  if (declared !== undefined && !isSamTemplateRecord(declared)) {
    throw triggerError(
      event,
      "UserPool",
      "the pool's LambdaConfig is not a block of triggers by name, and a " +
        "Cognito event has no way to add a trigger to one",
    );
  }

  return samRecordAt(properties, "LambdaConfig");
}

/**
 * The function the trigger runs, refusing a trigger the pool already names a
 * function for.
 */
function functionArn(
  event: SamFunctionEvent,
  declared: SimCfnTemplateValueRecord,
  name: string,
): SimCfnTemplateValue {
  // oxlint-disable-next-line security/detect-object-injection -- a template record read by a trigger name the event stated.
  if (declared[name] !== undefined) {
    throw triggerError(
      event,
      "Trigger",
      `the pool already names a function for ${name}, and it runs one ` +
        "function per trigger",
    );
  }

  return { "Fn::GetAtt": [event.functionLogicalId, "Arn"] };
}

function triggerError(
  event: SamFunctionEvent,
  property: string,
  reason: string,
): Error {
  return samPropertyError({
    resourceType: samFunctionType,
    logicalId: event.functionLogicalId,
    property: `Events.${event.eventName}.${property}`,
    reason,
  });
}
