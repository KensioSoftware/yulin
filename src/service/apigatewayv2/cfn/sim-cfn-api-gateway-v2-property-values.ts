import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Reads the value shapes an AWS::ApiGatewayV2::* property can take.
 *
 * This is the half of property validation about what a value is, as
 * SimCfnApiGatewayV2PropertyParser is the half about which properties may
 * appear at all. A template value arrives as whatever JSON held, and a
 * property carrying the wrong shape is refused here rather than reaching a
 * command as something it cannot use.
 *
 * The Resource type is carried so a message names the template entry a reader
 * has to go and fix.
 */
export class SimCfnApiGatewayV2PropertyValues {
  protected readonly resourceType: string;

  constructor(resourceType: string) {
    this.resourceType = resourceType;
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
   * Parse a property value that must be a list of strings when present, which
   * is the shape a route's `AuthorizationScopes` and an authorizer's
   * `IdentitySource` take.
   */
  optionalStringList(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string[] | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw this.invalidPropertyError(resource, label, "a list of strings");
    }

    return value.map((entry, index) =>
      this.requiredString(resource, entry, `${label}[${String(index)}]`),
    );
  }

  /**
   * Parse a property value that must be a record of further properties when
   * present, which is the shape an authorizer's `JwtConfiguration` takes.
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
   * which is the shape a stage's `StageVariables` takes.
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
}
