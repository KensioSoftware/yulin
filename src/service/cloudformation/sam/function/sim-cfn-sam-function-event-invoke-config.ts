import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../sim-cfn-sam-record.js";
import { samAsyncTargetPolicies } from "./sim-cfn-sam-function-async-targets.js";
import { samDestinations } from "./sim-cfn-sam-function-destination.js";
import { samConditionAttribute } from "./sim-cfn-sam-function-properties.js";
import { conditioned, stated } from "./sim-cfn-sam-function-stated.js";

interface SamEventInvokeConfigProperties {
  readonly logicalId: string;
  readonly functionProperties: SimCfnTemplateValueRecord;
  readonly condition: SimCfnTemplateValue | undefined;
}

/**
 * The AWS::Lambda::EventInvokeConfig a SAM function's `EventInvokeConfig`
 * expands to, on `$LATEST`, and the queue or topic SAM creates for a
 * destination that names only a `Type`.
 */
export function samFunctionEventInvokeConfigResources(
  properties: SamEventInvokeConfigProperties,
): Record<string, SimCfnTemplateValueRecord> {
  const { logicalId, functionProperties, condition } = properties;
  const declared = functionProperties["EventInvokeConfig"];

  if (!isSamTemplateRecord(declared)) {
    return {};
  }

  const destinations = samDestinations(logicalId, declared);

  return {
    [`${logicalId}EventInvokeConfig`]: {
      Type: "AWS::Lambda::EventInvokeConfig",
      ...samConditionAttribute(condition),
      Properties: {
        FunctionName: { Ref: logicalId },
        Qualifier: "$LATEST",
        ...stated(declared, "MaximumEventAgeInSeconds"),
        ...stated(declared, "MaximumRetryAttempts"),
        DestinationConfig: Object.fromEntries(
          destinations.map((destination) => [
            destination.outcome,
            { Destination: destination.target.arn },
          ]),
        ),
      },
    },
    ...Object.fromEntries(
      destinations.flatMap((destination) =>
        Object.entries(conditioned(destination.created, condition)),
      ),
    ),
  };
}

/**
 * The inline policies SAM gives the generated execution Role so the function
 * may deliver to each of its destinations.
 */
export function samFunctionEventInvokeConfigPolicies(
  logicalId: string,
  functionProperties: SimCfnTemplateValueRecord,
): readonly SimCfnTemplateValueRecord[] {
  const declared = functionProperties["EventInvokeConfig"];

  return isSamTemplateRecord(declared)
    ? samDestinations(logicalId, declared).flatMap((destination) =>
        samAsyncTargetPolicies(
          `${logicalId}RoleEventInvokeConfig${destination.outcome}Policy`,
          destination.target,
        ),
      )
    : [];
}
