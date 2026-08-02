import type { SimHttpApiStage } from "../../../../apigatewayv2/api/stage/sim-http-api-stage.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimHttpApiStageCfnProperties {
  readonly stage: SimHttpApiStage;
}

/**
 * CloudFormation-facing values for a simulated HTTP API stage.
 */
export class SimHttpApiStageCfn implements SimCfnResourceValueAdapter {
  private readonly stage: SimHttpApiStage;

  constructor(properties: SimHttpApiStageCfnProperties) {
    this.stage = properties.stage;
  }

  /**
   * AWS::ApiGatewayV2::Stage Ref returns the stage name, which is what every
   * stage operation names the stage by. A stage has no id of its own.
   */
  refValue(): SimCfnTemplateValue {
    return this.stage.stageName;
  }

  /**
   * AWS::ApiGatewayV2::Stage publishes no Fn::GetAtt attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `Unsupported AWS::ApiGatewayV2::Stage attribute ${attributeName}`,
    );
  }
}
