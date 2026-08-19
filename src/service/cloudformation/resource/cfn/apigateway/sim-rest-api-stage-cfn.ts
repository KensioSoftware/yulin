import type { SimRestApiStage } from "../../../../apigateway/api/stage/sim-rest-api-stage.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimRestApiStageCfnProperties {
  readonly stage: SimRestApiStage;
}

/**
 * CloudFormation-facing values for a simulated REST API stage.
 */
export class SimRestApiStageCfn implements SimCfnResourceValueAdapter {
  private readonly stage: SimRestApiStage;

  constructor(properties: SimRestApiStageCfnProperties) {
    this.stage = properties.stage;
  }

  /**
   * AWS::ApiGateway::Stage Ref returns the stage name. That is also the first
   * path segment of the endpoint the stage serves on, which is how CDK builds
   * the API's URL.
   */
  refValue(): SimCfnTemplateValue {
    return this.stage.stageName;
  }

  /**
   * AWS::ApiGateway::Stage publishes no Fn::GetAtt attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `Unsupported AWS::ApiGateway::Stage attribute ${attributeName}`,
    );
  }
}
