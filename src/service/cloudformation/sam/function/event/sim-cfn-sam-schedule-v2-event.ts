import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samPickedProperties } from "../../sim-cfn-sam-picked.js";
import { samEventStateProperty } from "./sim-cfn-sam-event-state.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-function-events.js";

/**
 * The properties an event and a schedule name the same thing, so expanding
 * them is carrying them across.
 */
const carriedProperties = new Set([
  "Description",
  "EndDate",
  "GroupName",
  "KmsKeyArn",
  "Name",
  "ScheduleExpression",
  "ScheduleExpressionTimezone",
  "StartDate",
]);

/**
 * The time window AWS requires on a schedule, for an event stating none.
 */
const fixedTimeWindow: SimCfnTemplateValueRecord = { Mode: "OFF" };

/**
 * Expand one `ScheduleV2` event into the EventBridge Scheduler schedule that
 * invokes the function.
 *
 * This is the other way to put a function on a timer, and it expands into an
 * `AWS::Scheduler::Schedule` rather than a rule. The difference that shows is
 * how the invocation is authorized. A schedule assumes an execution role and
 * invokes as that role, where a rule arrives as a service principal and the
 * function's resource policy decides. So this expands a Role rather than a
 * permission, unless the event named a `RoleArn` of its own to run as.
 */
export function samScheduleV2EventResources(
  event: SamFunctionEvent,
): Record<string, SimCfnTemplateValue> {
  const prefix = `${event.functionLogicalId}${event.eventName}`;
  const roleLogicalId = `${prefix}ScheduleRole`;
  const declaredRoleArn = event.properties["RoleArn"];

  return {
    [`${prefix}Schedule`]: {
      Type: "AWS::Scheduler::Schedule",
      ...event.condition,
      Properties: {
        ...samPickedProperties(event.properties, carriedProperties),
        ...samEventStateProperty(event.properties),
        FlexibleTimeWindow:
          event.properties["FlexibleTimeWindow"] ?? fixedTimeWindow,
        Target: {
          Arn: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
          RoleArn: declaredRoleArn ?? { "Fn::GetAtt": [roleLogicalId, "Arn"] },
          ...samPickedProperties(event.properties, new Set(["Input"])),
        },
      },
    },
    ...(declaredRoleArn === undefined && {
      [roleLogicalId]: samScheduleV2RoleResource(event, prefix),
    }),
  };
}

/**
 * The AWS::IAM::Role the schedule invokes the function as.
 *
 * Scheduler assumes this role for every invocation, so it trusts the Scheduler
 * service principal and may invoke the one function the event was declared on.
 * A role granting `lambda:InvokeFunction` on everything would be the same
 * schedule with a wider grant than the event asked for.
 */
function samScheduleV2RoleResource(
  event: SamFunctionEvent,
  prefix: string,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::IAM::Role",
    ...event.condition,
    Properties: {
      AssumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "scheduler.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      },
      Policies: [
        {
          PolicyName: `${prefix}ScheduleRolePolicy`,
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "lambda:InvokeFunction",
                Resource: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
              },
            ],
          },
        },
      ],
    },
  };
}
