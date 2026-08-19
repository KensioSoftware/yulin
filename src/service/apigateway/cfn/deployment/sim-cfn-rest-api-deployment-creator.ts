import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApiDeployment } from "../../api/deployment/sim-rest-api-deployment.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";
import { SimCfnRestApiDeploymentProperties } from "./sim-cfn-rest-api-deployment-properties.js";

interface SimCfnRestApiDeploymentCreatorProperties {
  readonly apiGateway: SimApiGateway;
}

/**
 * Creates deployments from AWS::ApiGateway::Deployment Resources.
 *
 * CDK writes a `DependsOn` naming every method of the API, so the deployment
 * is created after the resources and methods it publishes. Nothing here reads
 * that ordering, because a stage serves the API's current resources rather
 * than a frozen copy of them.
 */
export class SimCfnRestApiDeploymentCreator {
  private readonly apiGateway: SimApiGateway;

  constructor(properties: SimCfnRestApiDeploymentCreatorProperties) {
    this.apiGateway = properties.apiGateway;
  }

  /**
   * Create a deployment from an AWS::ApiGateway::Deployment Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRestApiDeployment> {
    const deploymentProperties = new SimCfnRestApiDeploymentProperties({
      resource,
      properties,
    });
    const restApiId = deploymentProperties.restApiId();

    const created = await this.apiGateway.createDeployment({
      input: deploymentProperties.createDeploymentInput(),
    });

    const deployment = this.apiGateway
      .findRestApi(restApiId)
      ?.deployments.find(created.id);
    assertDefined(
      deployment,
      `sim REST API deployment ${created.id} after CloudFormation creation`,
    );

    return deployment;
  }
}
