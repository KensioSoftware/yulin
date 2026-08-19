import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApiResource } from "../../api/resource/sim-rest-api-resource.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";
import { SimCfnRestApiResourceProperties } from "./sim-cfn-rest-api-resource-properties.js";

interface SimCfnRestApiResourceCreatorProperties {
  readonly apiGateway: SimApiGateway;
}

/**
 * Creates the nodes of a REST API's path tree from AWS::ApiGateway::Resource
 * Resources.
 *
 * A node names its parent, so CloudFormation creates the tree from the root
 * down, in the order the `Ref`s between the Resources give it.
 */
export class SimCfnRestApiResourceCreator {
  private readonly apiGateway: SimApiGateway;

  constructor(properties: SimCfnRestApiResourceCreatorProperties) {
    this.apiGateway = properties.apiGateway;
  }

  /**
   * Create a path tree node from an AWS::ApiGateway::Resource Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRestApiResource> {
    const resourceProperties = new SimCfnRestApiResourceProperties({
      resource,
      properties,
    });
    const restApiId = resourceProperties.restApiId();

    const created = await this.apiGateway.createResource({
      input: resourceProperties.createResourceInput(),
    });

    const apiResource = this.apiGateway
      .findRestApi(restApiId)
      ?.resources.find(created.id);
    assertDefined(
      apiResource,
      `sim REST API resource ${created.id} after CloudFormation creation`,
    );

    return apiResource;
  }
}
