import type { SimRestApiResource } from "../../../../apigateway/api/resource/sim-rest-api-resource.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimRestApiResourceCfnProperties {
  readonly resource: SimRestApiResource;
}

/**
 * CloudFormation-facing values for one node of a simulated REST API's path
 * tree.
 */
export class SimRestApiResourceCfn implements SimCfnResourceValueAdapter {
  private readonly resource: SimRestApiResource;

  constructor(properties: SimRestApiResourceCfnProperties) {
    this.resource = properties.resource;
  }

  /**
   * AWS::ApiGateway::Resource Ref returns the resource id, which is what a
   * method's `ResourceId` and a child resource's `ParentId` name it by.
   */
  refValue(): SimCfnTemplateValue {
    return this.resource.resourceId;
  }

  /**
   * AWS::ApiGateway::Resource publishes ResourceId.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "ResourceId") {
      return this.resource.resourceId;
    }

    throw new Error(
      `Unsupported AWS::ApiGateway::Resource attribute ${attributeName}`,
    );
  }
}
