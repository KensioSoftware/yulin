import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimApiMapping } from "../../domain/sim-api-mapping.js";
import type { SimApiGatewayV2 } from "../../sim-api-gateway-v2.js";
import { SimCfnApiMappingProperties } from "./sim-cfn-api-mapping-properties.js";

interface SimCfnApiMappingCreatorProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * Creates simulated API mappings from AWS::ApiGatewayV2::ApiMapping Resources.
 */
export class SimCfnApiMappingCreator {
  private readonly apiGatewayV2: SimApiGatewayV2;

  constructor(properties: SimCfnApiMappingCreatorProperties) {
    this.apiGatewayV2 = properties.apiGatewayV2;
  }

  /**
   * Create an API mapping from an AWS::ApiGatewayV2::ApiMapping Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimApiMapping> {
    const mappingProperties = new SimCfnApiMappingProperties({
      resource,
      properties,
    });
    const domainName = mappingProperties.domainName();

    const created = await this.apiGatewayV2.createApiMapping({
      input: mappingProperties.createApiMappingInput(),
    });

    const mapping = this.apiGatewayV2
      .findDomainName(domainName)
      ?.apiMappings.find(created.ApiMappingId);
    assertDefined(
      mapping,
      `sim API mapping ${created.ApiMappingId} after CloudFormation creation`,
    );

    return mapping;
  }
}
