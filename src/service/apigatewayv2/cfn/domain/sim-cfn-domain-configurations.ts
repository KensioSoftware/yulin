import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimHttpApiDomainNameConfiguration } from "../../domain/sim-http-api-domain-name.js";
import type { SimCfnApiGatewayV2PropertyParser } from "../sim-cfn-api-gateway-v2-property-parser.js";

/**
 * The members of a `DomainNameConfigurations` entry that reach the command.
 * The rest are recorded against the Resource the way a whole property is.
 */
const simulatedMembers = new Set([
  "CertificateArn",
  "CertificateName",
  "EndpointType",
  "SecurityPolicy",
]);

interface SimCfnDomainConfigurationsProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnApiGatewayV2PropertyParser;
}

/**
 * Reads the `DomainNameConfigurations` of an AWS::ApiGatewayV2::DomainName.
 *
 * A member this simulation does not read is recorded and left out rather than
 * refusing the Resource, which is what the property allow-list does one level
 * up. A member `CreateDomainName` refuses, such as an `EndpointType` of
 * `EDGE`, is kept and refused there, which is where the reason lives.
 */
export class SimCfnDomainConfigurations {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnApiGatewayV2PropertyParser;

  constructor(properties: SimCfnDomainConfigurationsProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * Read one `DomainNameConfigurations` entry.
   */
  configuration(
    configuration: SimCfnTemplateValueRecord,
    index: number,
  ): SimHttpApiDomainNameConfiguration {
    const label = `DomainNameConfigurations[${String(index)}]`;
    const read: SimHttpApiDomainNameConfiguration = {};

    for (const [member, value] of Object.entries(configuration)) {
      if (simulatedMembers.has(member)) {
        read[member as keyof SimHttpApiDomainNameConfiguration] =
          this.propertyParser.requiredString(
            this.resource,
            value,
            `${label}.${member}`,
          );
        continue;
      }

      this.resource.ignoreProperty(
        `${label}.${member}`,
        `AWS::ApiGatewayV2::DomainName ${label}.${member} is not simulated, ` +
          `so the domain is created without it.`,
      );
    }

    return read;
  }
}
