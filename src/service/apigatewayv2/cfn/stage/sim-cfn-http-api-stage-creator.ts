import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimHttpApiStage } from "../../api/stage/sim-http-api-stage.js";
import type { SimApiGatewayV2 } from "../../sim-api-gateway-v2.js";
import { SimCfnHttpApiStageProperties } from "./sim-cfn-http-api-stage-properties.js";

interface SimCfnHttpApiStageCreatorProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * Creates simulated stages from AWS::ApiGatewayV2::Stage Resources.
 *
 * A stage depends on its API and on nothing else, so CDK's `$default` stage is
 * created before any of the routes it serves. That is the same order real
 * CloudFormation uses, and it works here because a stage holds no copy of the
 * routes: it is matched against whatever the API has when a request arrives.
 */
export class SimCfnHttpApiStageCreator {
  private readonly apiGatewayV2: SimApiGatewayV2;

  constructor(properties: SimCfnHttpApiStageCreatorProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
  }

  /**
   * Create a stage from an AWS::ApiGatewayV2::Stage Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimHttpApiStage> {
    const stageProperties = new SimCfnHttpApiStageProperties({
      resource,
      properties,
    });
    const apiId = stageProperties.apiId();

    const created = await this.apiGatewayV2.createStage({
      input: stageProperties.createStageInput(),
    });

    const stage = this.apiGatewayV2
      .findApi(apiId)
      ?.stages.find(created.StageName);
    assertDefined(
      stage,
      `sim HTTP API stage ${created.StageName} after CloudFormation creation`,
    );

    return stage;
  }
}
