import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateApiMappingCommandInput } from "../../command/domain/api-mapping.command.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";

/**
 * The AWS::ApiGatewayV2::ApiMapping properties this simulation deploys, which
 * is every property the Resource type has.
 */
const simulatedProperties = ["ApiId", "DomainName", "Stage", "ApiMappingKey"];

interface SimCfnApiMappingPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGatewayV2::ApiMapping CloudFormation properties into the
 * CreateApiMapping input the mapping creator needs.
 */
export class SimCfnApiMappingProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayV2PropertyParser({
    resourceType: "AWS::ApiGatewayV2::ApiMapping",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnApiMappingPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The domain name this mapping belongs to, which a template reaches with a
   * `Ref` on its AWS::ApiGatewayV2::DomainName.
   */
  domainName(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["DomainName"],
      "DomainName",
    );
  }

  /**
   * The CreateApiMapping input this Resource asks for.
   *
   * The stage has to exist already. CDK gives the mapping an explicit
   * dependency on its stage, because the `Stage` property is the stage's name
   * rather than a `Ref` that CloudFormation could take an order from.
   */
  createApiMappingInput(): SimCreateApiMappingCommandInput {
    return {
      DomainName: this.domainName(),
      ApiId: this.propertyParser.requiredString(
        this.resource,
        this.properties["ApiId"],
        "ApiId",
      ),
      Stage: this.propertyParser.requiredString(
        this.resource,
        this.properties["Stage"],
        "Stage",
      ),
      ApiMappingKey: this.propertyParser.optionalString(
        this.resource,
        this.properties["ApiMappingKey"],
        "ApiMappingKey",
      ),
    };
  }
}
