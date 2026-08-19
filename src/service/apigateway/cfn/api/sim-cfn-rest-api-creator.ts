import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";
import { SimCfnRestApiProperties } from "./sim-cfn-rest-api-properties.js";

interface SimCfnRestApiCreatorProperties {
  readonly apiGateway: SimApiGateway;
}

/**
 * Creates simulated REST APIs from AWS::ApiGateway::RestApi Resources.
 *
 * The API goes through the ordinary CreateRestApi command, so a template is
 * held to the same rules an SDK caller is, with the reason the command gives.
 */
export class SimCfnRestApiCreator {
  private readonly apiGateway: SimApiGateway;

  constructor(properties: SimCfnRestApiCreatorProperties) {
    this.apiGateway = properties.apiGateway;
  }

  /**
   * Create a REST API from an AWS::ApiGateway::RestApi Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRestApi> {
    const created = await this.apiGateway.createRestApi({
      input: new SimCfnRestApiProperties({
        resource,
        properties,
      }).createRestApiInput(),
    });

    const restApi = this.apiGateway.findRestApi(created.id);
    assertDefined(
      restApi,
      `sim REST API ${created.id} after CloudFormation creation`,
    );

    return restApi;
  }
}
