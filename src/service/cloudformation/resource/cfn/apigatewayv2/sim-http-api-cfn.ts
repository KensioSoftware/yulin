import type { SimHttpApi } from "../../../../apigatewayv2/api/sim-http-api.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimHttpApiCfnProperties {
  readonly httpApi: SimHttpApi;
}

/**
 * CloudFormation-facing values for a simulated HTTP API.
 */
export class SimHttpApiCfn implements SimCfnResourceValueAdapter {
  private readonly httpApi: SimHttpApi;

  constructor(properties: SimHttpApiCfnProperties) {
    this.httpApi = properties.httpApi;
  }

  /**
   * AWS::ApiGatewayV2::Api Ref returns the API id, which is what every route,
   * integration and stage under the API names it by.
   */
  refValue(): SimCfnTemplateValue {
    return this.httpApi.apiId;
  }

  /**
   * AWS::ApiGatewayV2::Api publishes ApiEndpoint and ApiId.
   *
   * `ApiEndpoint` is the generated endpoint with no trailing slash and no
   * stage segment, as real API Gateway reports it. That is the real AWS
   * hostname rather than the localhost one, in the same way a Lambda Function
   * URL reports its real hostname; the serving layer accepts both.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "ApiEndpoint") {
      return this.httpApi.apiEndpoint;
    }

    if (attributeName === "ApiId") {
      return this.httpApi.apiId;
    }

    throw new Error(
      `Unsupported AWS::ApiGatewayV2::Api attribute ${attributeName}`,
    );
  }
}
