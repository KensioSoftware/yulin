import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimApiGatewayV2 } from "../sim-api-gateway-v2.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import { SimCfnHttpApiPartDeleter } from "./sim-cfn-http-api-part-deleter.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimCfnApiGatewayV2ResourceDeleterProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * Deletes the simulated API Gateway v2 resources a CloudFormation Stack
 * created.
 *
 * The API itself is the only Resource type addressed by nothing but its own
 * object. Everything else is a part of an API, and is deleted by
 * SimCfnHttpApiPartDeleter, which knows to find the API first.
 */
export class SimCfnApiGatewayV2ResourceDeleter {
  private readonly apiGatewayV2: SimApiGatewayV2;
  private readonly partDeleter: SimCfnHttpApiPartDeleter;

  constructor(properties: SimCfnApiGatewayV2ResourceDeleterProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
    this.partDeleter = new SimCfnHttpApiPartDeleter(properties);
  }

  /**
   * Delete a simulated API Gateway v2 resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    if (resourceTypeName !== "Api") {
      await this.partDeleter.delete(resourceTypeName, resource, properties);

      return;
    }

    const api = resource.simResource as SimHttpApi | undefined;
    assertDefined(
      api,
      `sim HTTP API for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.apiGatewayV2.deleteApi({ input: { ApiId: api.apiId } });
  }
}
