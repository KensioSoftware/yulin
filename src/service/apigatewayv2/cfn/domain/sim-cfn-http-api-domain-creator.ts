import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimHttpApiDomainName } from "../../domain/sim-http-api-domain-name.js";
import type { SimApiGatewayV2 } from "../../sim-api-gateway-v2.js";
import { SimCfnHttpApiDomainProperties } from "./sim-cfn-http-api-domain-properties.js";

interface SimCfnHttpApiDomainCreatorProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * Creates simulated custom domain names from AWS::ApiGatewayV2::DomainName
 * Resources.
 *
 * A domain depends on nothing, and serves nothing until an
 * AWS::ApiGatewayV2::ApiMapping points it at an API and a stage. That is the
 * order real CloudFormation uses, since a mapping names its domain and takes
 * its dependency from doing so.
 */
export class SimCfnHttpApiDomainCreator {
  private readonly apiGatewayV2: SimApiGatewayV2;

  constructor(properties: SimCfnHttpApiDomainCreatorProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
  }

  /**
   * Create a domain name from an AWS::ApiGatewayV2::DomainName Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimHttpApiDomainName> {
    const domainProperties = new SimCfnHttpApiDomainProperties({
      resource,
      properties,
    });

    const created = await this.apiGatewayV2.createDomainName({
      input: domainProperties.createDomainNameInput(),
    });

    const domain = this.apiGatewayV2.findDomainName(created.DomainName);
    assertDefined(
      domain,
      `sim HTTP API domain name ${created.DomainName} after CloudFormation creation`,
    );

    return domain;
  }
}
