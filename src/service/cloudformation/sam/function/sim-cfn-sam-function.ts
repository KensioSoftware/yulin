import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { samMergedFunctionProperties } from "../sim-cfn-sam-globals.js";
import { samFunctionEventResources } from "./event/sim-cfn-sam-function-events.js";
import {
  samCarriedAttributes,
  samCarriedProperties,
  samResourceProperties,
} from "./sim-cfn-sam-function-properties.js";
import { samFunctionRoleResource } from "./sim-cfn-sam-function-role.js";
import { samFunctionUrlResources } from "./sim-cfn-sam-function-url.js";

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
 * The `Events` of the function reach the world in front of it, and a
 * `FunctionUrlConfig` is the AWS::Lambda::Url it answers on. Both expand into
 * Resources beside the function, named after it, so what an event made is
 * something a template can `Ref` and something a Stack tears down.
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
  const condition = resource["Condition"];

  const lambdaFunction: SimCfnTemplateValueRecord = {
    Type: "AWS::Lambda::Function",
    ...samCarriedAttributes(resource),
    Properties: {
      ...samCarriedProperties(functionProperties),
      Role: declaredRole ?? { "Fn::GetAtt": [roleLogicalId, "Arn"] },
    },
  };

  return {
    [logicalId]: lambdaFunction,
    ...(declaredRole === undefined && {
      [roleLogicalId]: samFunctionRoleResource({
        logicalId,
        functionProperties,
        condition,
      }),
    }),
    ...samFunctionUrlResources({ logicalId, functionProperties, condition }),
    ...samFunctionEventResources({ logicalId, functionProperties, condition }),
  };
}
