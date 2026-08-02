import type { SimHttpApiAuthorizer } from "../../../../apigatewayv2/api/authorizer/sim-http-api-authorizer.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimHttpApiAuthorizerCfnProperties {
  readonly authorizer: SimHttpApiAuthorizer;
}

/**
 * CloudFormation-facing values for a simulated HTTP API JWT authorizer.
 */
export class SimHttpApiAuthorizerCfn implements SimCfnResourceValueAdapter {
  private readonly authorizer: SimHttpApiAuthorizer;

  constructor(properties: SimHttpApiAuthorizerCfnProperties) {
    this.authorizer = properties.authorizer;
  }

  /**
   * AWS::ApiGatewayV2::Authorizer Ref returns the authorizer id, which is what
   * a route names it by.
   */
  refValue(): SimCfnTemplateValue {
    return this.authorizer.authorizerId;
  }

  /**
   * AWS::ApiGatewayV2::Authorizer publishes AuthorizerId.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "AuthorizerId") {
      return this.authorizer.authorizerId;
    }

    throw new Error(
      `Unsupported AWS::ApiGatewayV2::Authorizer attribute ${attributeName}`,
    );
  }
}
