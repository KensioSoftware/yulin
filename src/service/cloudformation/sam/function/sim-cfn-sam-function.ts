import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { samMergedFunctionProperties } from "../sim-cfn-sam-globals.js";
import {
  samCarriedAttributes,
  samCarriedProperties,
  samResourceProperties,
} from "./sim-cfn-sam-function-properties.js";
import { samFunctionRoleResource } from "./sim-cfn-sam-function-role.js";

interface SamFunctionExpansionProperties {
  readonly logicalId: string;
  readonly resource: SimCfnTemplateValueRecord;
  readonly globals: SimCfnTemplateValueRecord;
}

/**
 * The SAM Resource type this expansion covers.
 */
export const samFunctionType = "AWS::Serverless::Function";

/**
 * Expand one AWS::Serverless::Function into the Resources CloudFormation
 * deploys for it.
 *
 * The Lambda function keeps the logical ID the template gave the SAM Resource,
 * so `Ref` and `Fn::GetAtt` against that name answer what they answer for the
 * function, and a handler bound to it by logical ID backs the function it
 * names. The execution Role is a second Resource named after it, unless the
 * function named a Role of its own to run as.
 *
 * `CodeUri` is not carried over. Nothing reads code off disk here, and a
 * function a bound handler backs needs no `Code` at all. A function carrying
 * neither is reported as skipped the way an unbacked AWS::Lambda::Function
 * is.
 */
export function samFunctionResources(
  properties: SamFunctionExpansionProperties,
): Record<string, SimCfnTemplateValue> {
  const { logicalId, resource, globals } = properties;
  const functionProperties = samMergedFunctionProperties(
    globals,
    samResourceProperties(resource),
  );
  const roleLogicalId = `${logicalId}Role`;
  const declaredRole = functionProperties["Role"];

  const lambdaFunction: SimCfnTemplateValueRecord = {
    Type: "AWS::Lambda::Function",
    ...samCarriedAttributes(resource),
    Properties: {
      ...samCarriedProperties(functionProperties),
      Role: declaredRole ?? { "Fn::GetAtt": [roleLogicalId, "Arn"] },
    },
  };

  if (declaredRole !== undefined) {
    return { [logicalId]: lambdaFunction };
  }

  return {
    [logicalId]: lambdaFunction,
    [roleLogicalId]: samFunctionRoleResource({
      logicalId,
      functionProperties,
      condition: resource["Condition"],
    }),
  };
}
