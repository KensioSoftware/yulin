import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnApiGatewayV2PropertyValues } from "./sim-cfn-api-gateway-v2-property-values.js";

interface SimCfnApiGatewayV2PropertyParserProperties {
  readonly resourceType: string;
  readonly simulated: readonly string[];
}

/**
 * Validates the AWS::ApiGatewayV2::* CloudFormation properties of one Resource
 * type: which of them may appear, and, through the value parsing it inherits,
 * what shape each has to be.
 *
 * Each Resource type states the properties it simulates, and every other
 * property is refused. An allow-list rather than a list of known-unsimulated
 * properties is what keeps a template from quietly deploying an API that looks
 * configured to the template that configured it and unconfigured to every
 * request it serves.
 *
 * The Resource type is carried here because five of them are created, and a
 * message naming the wrong one would send a reader to the wrong template entry.
 */
export class SimCfnApiGatewayV2PropertyParser extends SimCfnApiGatewayV2PropertyValues {
  private readonly simulated: readonly string[];

  constructor(properties: SimCfnApiGatewayV2PropertyParserProperties) {
    super(properties.resourceType);
    this.simulated = properties.simulated;
  }

  /**
   * Refuse every property this Resource type does not simulate.
   *
   * A property whose only simulated value is one of the values it can take,
   * such as `ProtocolType`, counts as simulated here and is refused further
   * down by the API Gateway command that receives it, which is where the
   * reason lives.
   */
  requireOnlySimulated(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    for (const name of Object.keys(properties)) {
      if (!this.simulated.includes(name)) {
        throw this.unsimulatedPropertyError(resource, name);
      }
    }
  }

  /**
   * Build the diagnostic error for a property this simulator does not model.
   */
  private unsimulatedPropertyError(
    resource: SimCfnResource,
    label: string,
  ): Error {
    return new Error(
      `${this.resourceType} ${resource.logicalId} property ${label} is not ` +
        `simulated, and a deployed Resource ignoring it would behave ` +
        `differently here than on AWS. The simulated properties are ` +
        `${this.simulated.join(", ")}.`,
    );
  }
}
