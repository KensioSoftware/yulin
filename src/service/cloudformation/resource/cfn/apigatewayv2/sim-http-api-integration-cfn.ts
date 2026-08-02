import type { SimHttpApiIntegration } from "../../../../apigatewayv2/api/integration/sim-http-api-integration.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimHttpApiIntegrationCfnProperties {
  readonly integration: SimHttpApiIntegration;
}

/**
 * CloudFormation-facing values for a simulated HTTP API integration.
 */
export class SimHttpApiIntegrationCfn implements SimCfnResourceValueAdapter {
  private readonly integration: SimHttpApiIntegration;

  constructor(properties: SimHttpApiIntegrationCfnProperties) {
    this.integration = properties.integration;
  }

  /**
   * AWS::ApiGatewayV2::Integration Ref returns the integration id, which is
   * what a route target names the integration by. CDK builds that target by
   * joining this Ref onto `integrations/`.
   */
  refValue(): SimCfnTemplateValue {
    return this.integration.integrationId;
  }

  /**
   * AWS::ApiGatewayV2::Integration publishes IntegrationId.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "IntegrationId") {
      return this.integration.integrationId;
    }

    throw new Error(
      `Unsupported AWS::ApiGatewayV2::Integration attribute ${attributeName}`,
    );
  }
}
