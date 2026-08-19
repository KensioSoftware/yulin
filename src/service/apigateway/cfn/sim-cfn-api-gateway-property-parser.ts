import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnApiGatewayScalarValues } from "./sim-cfn-api-gateway-scalar-values.js";

interface SimCfnApiGatewayPropertyParserProperties {
  readonly resourceType: string;
  readonly simulated: readonly string[];
}

/**
 * Reads the AWS::ApiGateway::* CloudFormation properties of one Resource type:
 * which of them are acted on, and, through the value parsing it inherits, what
 * shape each of those has to be.
 *
 * Each Resource type states the properties it simulates, and every other
 * property is recorded against the Resource and left out of what is created.
 * An allow-list rather than a list of known-unsimulated properties is what
 * keeps a template from quietly deploying an API that looks configured to the
 * template that configured it and unconfigured to every request it serves. The
 * API is created either way, and the record says which of the two it is.
 *
 * The Resource type is carried here because five of them are created, and a
 * record naming the wrong one would send a reader to the wrong template entry.
 */
export class SimCfnApiGatewayPropertyParser extends SimCfnApiGatewayScalarValues {
  private readonly simulated: readonly string[];

  constructor(properties: SimCfnApiGatewayPropertyParserProperties) {
    super(properties.resourceType);
    this.simulated = properties.simulated;
  }

  /**
   * Record every property this Resource type does not simulate.
   *
   * A property whose only simulated value is one of the values it can take,
   * such as `AuthorizationType`, counts as simulated here and is refused
   * further down by the API Gateway command that receives it, which is where
   * the reason lives.
   *
   * The path prefix is what a nested block passes, so a method's ignored
   * `Integration` properties are recorded under the block they came from
   * rather than beside the method's own.
   */
  ignoreUnsimulated(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    pathPrefix = "",
  ): void {
    for (const name of Object.keys(properties)) {
      if (!this.simulated.includes(name)) {
        resource.ignoreProperty(
          `${pathPrefix}${name}`,
          this.unsimulatedPropertyReason(name),
        );
      }
    }
  }

  /**
   * Parse a property value that must be a record of further properties when
   * present, which is the shape a method's `Integration` takes.
   */
  optionalRecord(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
    expected = "an object",
  ): SimCfnTemplateValueRecord | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw this.invalidPropertyError(resource, label, expected);
    }

    return value;
  }

  /**
   * Parse a property value that must be an object of strings when present,
   * which is the shape a stage's `Variables` takes.
   */
  optionalStringMap(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): Record<string, string> | undefined {
    const record = this.optionalRecord(
      resource,
      value,
      label,
      "an object of strings",
    );

    if (record === undefined) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(record).map(([name, entry]) => [
        name,
        this.requiredString(resource, entry, `${label}.${name}`),
      ]),
    );
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
