import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApiStage } from "../../api/stage/sim-rest-api-stage.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";
import { SimCfnRestApiStageProperties } from "./sim-cfn-rest-api-stage-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnRestApiStageCreatorProperties {
  readonly apiGateway: SimApiGateway;
}

/**
 * Creates simulated stages from AWS::ApiGateway::Stage Resources.
 *
 * A stage names the deployment it serves, so CloudFormation creates it after
 * that deployment, which CDK in turn puts after every method of the API.
 */
export class SimCfnRestApiStageCreator {
  private readonly apiGateway: SimApiGateway;

  constructor(properties: SimCfnRestApiStageCreatorProperties) {
    this.apiGateway = properties.apiGateway;
  }

  /**
   * Create a stage from an AWS::ApiGateway::Stage Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimRestApiStage> {
    const stageProperties = new SimCfnRestApiStageProperties({
      resource,
      properties,
    });
    const restApiId = stageProperties.restApiId();

    const created = await this.apiGateway.createStage(
      { input: stageProperties.createStageInput() },
      options,
    );

    const stage = this.apiGateway
      .findRestApi(restApiId)
      ?.stages.find(created.stageName);
    assertDefined(
      stage,
      `sim REST API stage ${created.stageName} after CloudFormation creation`,
    );

    return stage;
  }
}
