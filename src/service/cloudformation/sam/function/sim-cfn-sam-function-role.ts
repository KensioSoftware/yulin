import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { samConditionAttribute } from "./sim-cfn-sam-function-properties.js";
import {
  basicExecutionPolicyArn,
  lambdaAssumeRolePolicyDocument,
  samFunctionPolicies,
} from "./sim-cfn-sam-function-policies.js";

interface SamFunctionRoleProperties {
  readonly logicalId: string;
  readonly functionProperties: SimCfnTemplateValueRecord;
  readonly condition: SimCfnTemplateValue | undefined;
}

/**
 * The AWS::IAM::Role Resource a SAM function is expanded with, for a function
 * that named no Role of its own.
 *
 * Every SAM function gets the basic execution policy, as SAM gives one, and
 * whatever its `Policies` said on top. The Role is conditioned the way the
 * function is. A function the template conditioned out leaves no Role behind
 * for the Stack to create.
 */
export function samFunctionRoleResource(
  properties: SamFunctionRoleProperties,
): SimCfnTemplateValueRecord {
  const { logicalId, functionProperties, condition } = properties;
  const policies = samFunctionPolicies(
    logicalId,
    functionProperties["Policies"],
  );

  return {
    Type: "AWS::IAM::Role",
    ...samConditionAttribute(condition),
    Properties: {
      AssumeRolePolicyDocument: lambdaAssumeRolePolicyDocument,
      ManagedPolicyArns: [
        basicExecutionPolicyArn,
        ...policies.managedPolicyArns,
      ],
      ...inlinePolicies(policies.inlinePolicies),
    },
  };
}

/**
 * The `Policies` property the Role carries, where the function stated policy
 * documents to put there.
 */
function inlinePolicies(
  policies: readonly SimCfnTemplateValueRecord[],
): SimCfnTemplateValueRecord {
  return policies.length > 0 ? { Policies: [...policies] } : {};
}
