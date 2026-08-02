import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";

interface SimCfnApiGatewayV2PropertyParserProperties {
  readonly resourceType: string;
  readonly simulated: readonly string[];
}

/**
 * Validates the AWS::ApiGatewayV2::* CloudFormation properties of one Resource
 * type, both which of them may appear and what shape each has to be.
 *
 * Each Resource type states the properties it simulates, and every other
 * property is refused. An allow-list rather than a list of known-unsimulated
 * properties is what keeps a template from quietly deploying an API that looks
 * configured to the template that configured it and unconfigured to every
 * request it serves.
 *
 * The Resource type is carried here because four of them are created, and a
 * message naming the wrong one would send a reader to the wrong template entry.
 */
export class SimCfnApiGatewayV2PropertyParser {
  private readonly resourceType: string;
  private readonly simulated: readonly string[];

  constructor(properties: SimCfnApiGatewayV2PropertyParserProperties) {
    this.resourceType = properties.resourceType;
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
   * Parse a property value that must be a string when present.
   */
  optionalString(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw this.invalidPropertyError(resource, label, "a string");
    }

    return value;
  }

  /**
   * Parse a property value that has to be there and has to be a string.
   */
  requiredString(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string {
    const parsed = this.optionalString(resource, value, label);

    if (parsed === undefined) {
      throw this.invalidPropertyError(resource, label, "a string");
    }

    return parsed;
  }

  /**
   * Parse a property value that must be a boolean when present.
   *
   * CloudFormation carries template booleans as the strings "true" and "false"
   * in places, so both forms are accepted, as CloudFormation itself accepts
   * them.
   */
  optionalBoolean(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (value === "true" || value === "false") {
      return value === "true";
    }

    throw this.invalidPropertyError(resource, label, "a boolean");
  }

  /**
   * Parse a property value that must be an object of strings when present,
   * which is the shape a stage's `StageVariables` takes.
   */
  optionalStringMap(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): Record<string, string> | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw this.invalidPropertyError(resource, label, "an object of strings");
    }

    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [
        name,
        this.requiredString(resource, entry, `${label}.${name}`),
      ]),
    );
  }

  /**
   * Build the diagnostic error for a malformed property value.
   */
  invalidPropertyError(
    resource: SimCfnResource,
    label: string,
    expected: string,
  ): TypeError {
    return new TypeError(
      `Invalid ${this.resourceType} ${resource.logicalId}: ` +
        `${label} must be ${expected}`,
    );
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
