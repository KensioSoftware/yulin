import type { SimRestApiDeployment } from "../../../../apigateway/api/deployment/sim-rest-api-deployment.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimRestApiDeploymentCfnProperties {
  readonly deployment: SimRestApiDeployment;
}

/**
 * CloudFormation-facing values for a simulated REST API deployment.
 */
export class SimRestApiDeploymentCfn implements SimCfnResourceValueAdapter {
  private readonly deployment: SimRestApiDeployment;

  constructor(properties: SimRestApiDeploymentCfnProperties) {
    this.deployment = properties.deployment;
  }

  /**
   * AWS::ApiGateway::Deployment Ref returns the deployment id, which is what a
   * stage's `DeploymentId` names it by.
   */
  refValue(): SimCfnTemplateValue {
    return this.deployment.deploymentId;
  }

  /**
   * AWS::ApiGateway::Deployment publishes DeploymentId.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "DeploymentId") {
      return this.deployment.deploymentId;
    }

    throw new Error(
      `Unsupported AWS::ApiGateway::Deployment attribute ${attributeName}`,
    );
  }
}
