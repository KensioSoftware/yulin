import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApiAuthorizer } from "../../api/authorizer/sim-rest-api-authorizer.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";
import { SimCfnRestApiAuthorizerProperties } from "./sim-cfn-rest-api-authorizer-properties.js";

interface SimCfnRestApiAuthorizerCreatorProperties {
  readonly apiGateway: SimApiGateway;
}

/**
 * Creates simulated authorizers from AWS::ApiGateway::Authorizer Resources.
 *
 * The authorizer goes through the ordinary CreateAuthorizer command, so a
 * `Type` other than `TOKEN`, a missing `AuthorizerUri` and an `IdentitySource`
 * naming something other than a header are all refused here with the reason
 * the command gives.
 */
export class SimCfnRestApiAuthorizerCreator {
  private readonly apiGateway: SimApiGateway;

  constructor(properties: SimCfnRestApiAuthorizerCreatorProperties) {
    this.apiGateway = properties.apiGateway;
  }

  /**
   * Create an authorizer from an AWS::ApiGateway::Authorizer Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRestApiAuthorizer> {
    const authorizerProperties = new SimCfnRestApiAuthorizerProperties({
      resource,
      properties,
    });

    const created = await this.apiGateway.createAuthorizer({
      input: authorizerProperties.createAuthorizerInput(),
    });

    const authorizer = this.apiGateway
      .findRestApi(authorizerProperties.restApiId())
      ?.authorizers.find(created.id);
    assertDefined(
      authorizer,
      `sim REST API authorizer ${created.id} after CloudFormation creation`,
    );

    return authorizer;
  }
}
