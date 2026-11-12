import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../sim-cfn-sam-record.js";
import {
  type SamAsyncTarget,
  samAsyncTargetPolicies,
  samAsyncTargetType,
} from "./sim-cfn-sam-function-async-targets.js";

/**
 * The queue or topic a SAM function's `DeadLetterQueue` names, if it names
 * one.
 */
function deadLetterTarget(
  functionProperties: SimCfnTemplateValueRecord,
): SamAsyncTarget | undefined {
  const declared = functionProperties["DeadLetterQueue"];

  if (!isSamTemplateRecord(declared)) {
    return undefined;
  }

  return {
    type: samAsyncTargetType(declared["Type"]),
    arn: declared["TargetArn"] as SimCfnTemplateValueRecord | string,
  };
}

/**
 * The `DeadLetterConfig` the expanded Lambda function carries, from the
 * `DeadLetterQueue` SAM states as a `Type` and a `TargetArn`.
 */
export function samFunctionDeadLetterConfig(
  functionProperties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const target = deadLetterTarget(functionProperties);

  return target === undefined
    ? {}
    : { DeadLetterConfig: { TargetArn: target.arn } };
}

/**
 * The inline policy SAM gives the generated execution Role so the function
 * may send to its dead-letter queue or topic.
 */
export function samFunctionDeadLetterPolicies(
  logicalId: string,
  functionProperties: SimCfnTemplateValueRecord,
): readonly SimCfnTemplateValueRecord[] {
  const target = deadLetterTarget(functionProperties);

  return target === undefined
    ? []
    : samAsyncTargetPolicies(`${logicalId}RoleDeadLetterQueuePolicy`, target);
}
