import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { samConditionAttribute } from "../function/sim-cfn-sam-function-properties.js";
import { samPickedProperties } from "../sim-cfn-sam-picked.js";
import { samStageLogicalId } from "./sim-cfn-sam-stage-logical-id.js";

interface SamRestApiStageProperties {
  readonly logicalId: string;
  readonly resource: SimCfnTemplateValueRecord;
  readonly apiProperties: SimCfnTemplateValueRecord;
}

/**
 * The stage of an API that names none.
 *
 * `StageName` is required on an AWS::Serverless::Api, and SAM refuses a
 * template leaving it out. Deployment here is best effort, so an API missing
 * it takes the name SAM gives the implicit API rather than failing the stack.
 */
export const samRestApiDefaultStageName = "Prod";

/**
 * The properties the stage takes off the SAM Resource. `Variables` are the
 * stage variables, and are named the same on both.
 */
const propertyNames = new Set(["Variables"]);

/**
 * The AWS::ApiGateway::Deployment and AWS::ApiGateway::Stage Resources a SAM
 * REST API is expanded with.
 *
 * A REST API serves nothing until a stage is published to it, and a stage is
 * published from a deployment, so the pair go together. A SAM template names
 * neither Resource, and the expansion deploys both.
 *
 * The deployment carries no `DependsOn` naming the methods, the way a
 * hand-written template does. A simulated stage serves the API's current
 * resources rather than a frozen copy, so a method created after the
 * deployment is served by it.
 *
 * Both are conditioned the way the API is. An API the template conditioned out
 * leaves neither behind for the Stack to create.
 */
export function samRestApiStageResources(
  properties: SamRestApiStageProperties,
): Record<string, SimCfnTemplateValue> {
  const { logicalId, resource, apiProperties } = properties;
  const stageName = apiProperties["StageName"] ?? samRestApiDefaultStageName;
  const deploymentLogicalId = `${logicalId}Deployment`;
  const condition = samConditionAttribute(resource["Condition"]);

  return {
    [deploymentLogicalId]: {
      Type: "AWS::ApiGateway::Deployment",
      ...condition,
      Properties: { RestApiId: { Ref: logicalId } },
    },
    [samStageLogicalId(logicalId, stageName)]: {
      Type: "AWS::ApiGateway::Stage",
      ...condition,
      Properties: {
        ...samPickedProperties(apiProperties, propertyNames),
        RestApiId: { Ref: logicalId },
        DeploymentId: { Ref: deploymentLogicalId },
        StageName: stageName,
      },
    },
  };
}
