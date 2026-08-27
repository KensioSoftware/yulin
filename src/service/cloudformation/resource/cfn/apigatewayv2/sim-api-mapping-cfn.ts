import type { SimApiMapping } from "../../../../apigatewayv2/domain/sim-api-mapping.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimApiMappingCfnProperties {
  readonly mapping: SimApiMapping;
}

/**
 * CloudFormation-facing values for a simulated API mapping.
 */
export class SimApiMappingCfn implements SimCfnResourceValueAdapter {
  private readonly mapping: SimApiMapping;

  constructor(properties: SimApiMappingCfnProperties) {
    this.mapping = properties.mapping;
  }

  /**
   * AWS::ApiGatewayV2::ApiMapping Ref returns the API mapping id, which is
   * what every mapping operation names it by.
   */
  refValue(): SimCfnTemplateValue {
    return this.mapping.apiMappingId;
  }

  /**
   * AWS::ApiGatewayV2::ApiMapping publishes ApiMappingId, which is the same
   * value Ref returns.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "ApiMappingId") {
      return this.mapping.apiMappingId;
    }

    throw new Error(
      `Unsupported AWS::ApiGatewayV2::ApiMapping attribute ${attributeName}`,
    );
  }
}
