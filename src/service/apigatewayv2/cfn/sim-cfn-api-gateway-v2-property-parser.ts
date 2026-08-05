import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnApiGatewayV2PropertyValues } from "./sim-cfn-api-gateway-v2-property-values.js";

interface SimCfnApiGatewayV2PropertyParserProperties {
  readonly resourceType: string;
  readonly simulated: readonly string[];
}

/**
 * Reads the AWS::ApiGatewayV2::* CloudFormation properties of one Resource
 * type: which of them are acted on, and, through the value parsing it inherits,
 * what shape each of those has to be.
 *
 * Each Resource type states the properties it simulates, and every other
 * property is recorded against the Resource and left out of what is created.
 * An allow-list rather than a list of known-unsimulated properties is what
 * keeps a template from quietly deploying an API that looks configured to the
 * template that configured it and unconfigured to every request it serves: the
 * API is created either way, and the record says which of the two it is.
 *
 * The Resource type is carried here because five of them are created, and a
 * record naming the wrong one would send a reader to the wrong template entry.
 */
export class SimCfnApiGatewayV2PropertyParser extends SimCfnApiGatewayV2PropertyValues {
  private readonly simulated: readonly string[];

  constructor(properties: SimCfnApiGatewayV2PropertyParserProperties) {
    super(properties.resourceType);
    this.simulated = properties.simulated;
  }

  /**
   * Record every property this Resource type does not simulate.
   *
   * A property whose only simulated value is one of the values it can take,
   * such as `ProtocolType`, counts as simulated here and is refused further
   * down by the API Gateway command that receives it, which is where the
   * reason lives.
   */
  ignoreUnsimulated(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    for (const name of Object.keys(properties)) {
      if (!this.simulated.includes(name)) {
        resource.ignoreProperty(name, this.unsimulatedPropertyReason(name));
      }
    }
  }

  /**
   * Say why a property this simulator does not model was left out.
   *
   * The simulated names are listed because an API Gateway Resource type has
   * many more properties than this creates the API from, so what it can act on
   * is the shorter and more useful half to read.
   */
  private unsimulatedPropertyReason(label: string): string {
    return (
      `${this.resourceType} property ${label} is not simulated, so the ` +
      `Resource is created without it and behaves differently here than on ` +
      `AWS. The simulated properties are ${this.simulated.join(", ")}.`
    );
  }
}
