import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";
import type { SimApiGatewayV2 } from "../../sim-api-gateway-v2.js";
import { SimCfnHttpApiProperties } from "./sim-cfn-http-api-properties.js";

interface SimCfnHttpApiCreatorProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * Creates simulated HTTP APIs from AWS::ApiGatewayV2::Api Resources.
 *
 * The API goes through the ordinary CreateApi command, so a WebSocket protocol
 * type and anything else the command refuses is refused here too, with the
 * reason the command gives.
 */
export class SimCfnHttpApiCreator {
  private readonly apiGatewayV2: SimApiGatewayV2;

  constructor(properties: SimCfnHttpApiCreatorProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
  }

  /**
   * Create an API from an AWS::ApiGatewayV2::Api Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimHttpApi> {
    const apiProperties = new SimCfnHttpApiProperties({
      resource,
      properties,
    });

    const created = await this.apiGatewayV2.createApi({
      input: apiProperties.createApiInput(),
    });

    const httpApi = this.apiGatewayV2.findApi(created.ApiId);
    assertDefined(
      httpApi,
      `sim HTTP API ${created.ApiId} after CloudFormation creation`,
    );

    return httpApi;
  }
}
