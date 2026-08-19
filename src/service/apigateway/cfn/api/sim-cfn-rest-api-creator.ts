import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApiView } from "../../api/sim-rest-api-view.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";
import type { SimCfnRestApiImports } from "../sim-cfn-rest-api-imports.js";
import { SimCfnRestApiImportProperties } from "./sim-cfn-rest-api-import-properties.js";
import { SimCfnRestApiProperties } from "./sim-cfn-rest-api-properties.js";

interface SimCfnRestApiCreatorProperties {
  readonly apiGateway: SimApiGateway;
  readonly imports: SimCfnRestApiImports;
}

/**
 * Creates simulated REST APIs from AWS::ApiGateway::RestApi Resources.
 *
 * The API goes through the ordinary CreateRestApi command, so a template is
 * held to the same rules an SDK caller is, with the reason the command gives.
 * An API declared as a `Body` goes through ImportRestApi instead, which is the
 * same translator an SDK caller importing a document reaches.
 */
export class SimCfnRestApiCreator {
  private readonly apiGateway: SimApiGateway;
  private readonly imports: SimCfnRestApiImports;

  constructor(properties: SimCfnRestApiCreatorProperties) {
    this.apiGateway = properties.apiGateway;
    this.imports = properties.imports;
  }

  /**
   * Create a REST API from an AWS::ApiGateway::RestApi Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRestApi> {
    const apiProperties = new SimCfnRestApiProperties({
      resource,
      properties,
    });

    const created = await this.created(resource, properties, apiProperties);

    if (apiProperties.imported()) {
      this.imports.record(created.id, resource.logicalId);
    }

    const restApi = this.apiGateway.findRestApi(created.id);
    assertDefined(
      restApi,
      `sim REST API ${created.id} after CloudFormation creation`,
    );

    return restApi;
  }

  /**
   * The API this Resource declares, however it declares it.
   */
  private async created(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    apiProperties: SimCfnRestApiProperties,
  ): Promise<SimRestApiView> {
    if (apiProperties.imported()) {
      return await this.apiGateway.importRestApi({
        input: new SimCfnRestApiImportProperties({
          resource,
          properties,
        }).importRestApiInput(),
      });
    }

    return await this.apiGateway.createRestApi({
      input: apiProperties.createRestApiInput(),
    });
  }
}
