import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimHttpApiView } from "../../api/sim-http-api-view.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";
import type { SimApiGatewayV2 } from "../../sim-api-gateway-v2.js";
import type { SimCfnHttpApiImports } from "../sim-cfn-http-api-imports.js";
import { SimCfnHttpApiProperties } from "./sim-cfn-http-api-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnHttpApiCreatorProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
  readonly imports: SimCfnHttpApiImports;
}

/**
 * Creates simulated HTTP APIs from AWS::ApiGatewayV2::Api Resources.
 *
 * The API goes through the ordinary CreateApi command, so a WebSocket protocol
 * type and anything else the command refuses is refused here too, with the
 * reason the command gives. An API declared as a `Body` goes through ImportApi
 * instead, which is the same translator an SDK caller importing a document
 * reaches, so a template and an SDK call produce the same API.
 */
export class SimCfnHttpApiCreator {
  private readonly apiGatewayV2: SimApiGatewayV2;
  private readonly imports: SimCfnHttpApiImports;

  constructor(properties: SimCfnHttpApiCreatorProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
    this.imports = properties.imports;
  }

  /**
   * Create an API from an AWS::ApiGatewayV2::Api Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimHttpApi> {
    const apiProperties = new SimCfnHttpApiProperties({
      resource,
      properties,
    });

    const created = await this.created(apiProperties, options);

    if (apiProperties.imported()) {
      this.imports.record(created.ApiId, resource.logicalId);
    }

    const httpApi = this.apiGatewayV2.findApi(created.ApiId);
    assertDefined(
      httpApi,
      `sim HTTP API ${created.ApiId} after CloudFormation creation`,
    );

    return httpApi;
  }

  /**
   * The API this Resource declares, however it declares it.
   */
  private async created(
    apiProperties: SimCfnHttpApiProperties,
    options: SimCfnResourceCallerOptions,
  ): Promise<SimHttpApiView> {
    if (apiProperties.imported()) {
      return await this.apiGatewayV2.importApi(
        { input: apiProperties.importApiInput() },
        options,
      );
    }

    return await this.apiGatewayV2.createApi(
      { input: apiProperties.createApiInput() },
      options,
    );
  }
}
