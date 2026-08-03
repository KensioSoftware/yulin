import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimHttpApiAuthorizer } from "../../api/authorizer/sim-http-api-authorizer.js";
import type { SimApiGatewayV2 } from "../../sim-api-gateway-v2.js";
import type { SimCfnHttpApiImports } from "../sim-cfn-http-api-imports.js";
import { SimCfnHttpApiAuthorizerProperties } from "./sim-cfn-http-api-authorizer-properties.js";

interface SimCfnHttpApiAuthorizerCreatorProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
  readonly imports: SimCfnHttpApiImports;
}

/**
 * Creates simulated authorizers from AWS::ApiGatewayV2::Authorizer Resources.
 *
 * The authorizer goes through the ordinary CreateAuthorizer command, so a
 * missing issuer or audience, an identity source that is not a header or query
 * string, and a `REQUEST` authorizer asking for payload format `1.0` are all
 * refused here with the reason the command gives.
 */
export class SimCfnHttpApiAuthorizerCreator {
  private readonly apiGatewayV2: SimApiGatewayV2;
  private readonly imports: SimCfnHttpApiImports;

  constructor(properties: SimCfnHttpApiAuthorizerCreatorProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
    this.imports = properties.imports;
  }

  /**
   * Create an authorizer from an AWS::ApiGatewayV2::Authorizer Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimHttpApiAuthorizer> {
    const authorizerProperties = new SimCfnHttpApiAuthorizerProperties({
      resource,
      properties,
    });
    const apiId = authorizerProperties.apiId();
    this.imports.requireNotImported(
      "AWS::ApiGatewayV2::Authorizer",
      resource,
      apiId,
    );

    const created = await this.apiGatewayV2.createAuthorizer({
      input: authorizerProperties.createAuthorizerInput(),
    });

    const authorizer = this.apiGatewayV2
      .findApi(apiId)
      ?.authorizers.find(created.AuthorizerId);
    assertDefined(
      authorizer,
      `sim HTTP API authorizer ${created.AuthorizerId} after CloudFormation ` +
        `creation`,
    );

    return authorizer;
  }
}
