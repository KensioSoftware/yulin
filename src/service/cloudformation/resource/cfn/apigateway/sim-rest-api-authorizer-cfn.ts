import type { SimRestApiAuthorizer } from "../../../../apigateway/api/authorizer/sim-rest-api-authorizer.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimRestApiAuthorizerCfnProperties {
  readonly authorizer: SimRestApiAuthorizer;
}

/**
 * CloudFormation-facing values for a simulated REST API authorizer.
 */
export class SimRestApiAuthorizerCfn implements SimCfnResourceValueAdapter {
  private readonly authorizer: SimRestApiAuthorizer;

  constructor(properties: SimRestApiAuthorizerCfnProperties) {
    this.authorizer = properties.authorizer;
  }

  /**
   * AWS::ApiGateway::Authorizer Ref returns the authorizer id, which is what a
   * method names it by and what CDK builds the authorizer's own ARN from.
   */
  refValue(): SimCfnTemplateValue {
    return this.authorizer.authorizerId;
  }

  /**
   * AWS::ApiGateway::Authorizer publishes AuthorizerId.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "AuthorizerId") {
      return this.authorizer.authorizerId;
    }

    throw new Error(
      `Unsupported AWS::ApiGateway::Authorizer attribute ${attributeName}`,
    );
  }
}
