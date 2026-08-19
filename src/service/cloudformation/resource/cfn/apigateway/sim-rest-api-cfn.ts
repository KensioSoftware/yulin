import type { SimRestApi } from "../../../../apigateway/api/sim-rest-api.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimRestApiCfnProperties {
  readonly restApi: SimRestApi;
}

/**
 * CloudFormation-facing values for a simulated REST API.
 */
export class SimRestApiCfn implements SimCfnResourceValueAdapter {
  private readonly restApi: SimRestApi;

  constructor(properties: SimRestApiCfnProperties) {
    this.restApi = properties.restApi;
  }

  /**
   * AWS::ApiGateway::RestApi Ref returns the API id, which is what every
   * resource, method, deployment and stage under the API names it by.
   */
  refValue(): SimCfnTemplateValue {
    return this.restApi.apiId;
  }

  /**
   * AWS::ApiGateway::RestApi publishes RestApiId and RootResourceId.
   *
   * `RootResourceId` is how a template hangs its first path segment off the
   * API, since the root resource is created with the API rather than declared.
   * There is no endpoint attribute, because a REST API reports none. CDK
   * builds the URL out of a `Ref` to the API and a `Ref` to the stage.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "RestApiId") {
      return this.restApi.apiId;
    }

    if (attributeName === "RootResourceId") {
      return this.restApi.rootResource.resourceId;
    }

    throw new Error(
      `Unsupported AWS::ApiGateway::RestApi attribute ${attributeName}`,
    );
  }
}
