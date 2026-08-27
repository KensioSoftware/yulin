import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateDomainNameCommandInput } from "../../command/domain/domain.command.js";
import type { SimHttpApiDomainNameConfiguration } from "../../domain/sim-http-api-domain-name.js";
import { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";
import { SimCfnDomainConfigurations } from "./sim-cfn-domain-configurations.js";

/**
 * The AWS::ApiGatewayV2::DomainName properties this simulation deploys.
 *
 * `MutualTlsAuthentication`, `RoutingMode` and `Tags` are left out, so a
 * template carrying one is recorded and the domain is created without it. A
 * simulated request arrives over plain HTTP, so there is no client
 * certificate to check, and routing rules are a second way to reach an API
 * that nothing here models.
 */
const simulatedProperties = ["DomainName", "DomainNameConfigurations"];

interface SimCfnHttpApiDomainPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ApiGatewayV2::DomainName CloudFormation properties into the
 * CreateDomainName input the domain creator needs.
 */
export class SimCfnHttpApiDomainProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnApiGatewayV2PropertyParser({
    resourceType: "AWS::ApiGatewayV2::DomainName",
    simulated: simulatedProperties,
  });

  private readonly configurationReader: SimCfnDomainConfigurations;

  constructor(properties: SimCfnHttpApiDomainPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
    this.configurationReader = new SimCfnDomainConfigurations({
      resource: this.resource,
      propertyParser: this.propertyParser,
    });

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The domain name, which is also what a `Ref` on this Resource returns.
   */
  domainName(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["DomainName"],
      "DomainName",
    );
  }

  /**
   * The CreateDomainName input this Resource asks for.
   */
  createDomainNameInput(): SimCreateDomainNameCommandInput {
    return {
      DomainName: this.domainName(),
      DomainNameConfigurations: this.configurations(),
    };
  }

  /**
   * The domain name configurations, read into the shape the command takes.
   */
  private configurations():
    | readonly SimHttpApiDomainNameConfiguration[]
    | undefined {
    const configurations = this.propertyParser.optionalRecordList(
      this.resource,
      this.properties["DomainNameConfigurations"],
      "DomainNameConfigurations",
    );

    return configurations?.map((configuration, index) =>
      this.configurationReader.configuration(configuration, index),
    );
  }
}
