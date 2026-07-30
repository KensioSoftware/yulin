import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

interface SimCfnCognitoValueParserProperties {
  readonly resourceType: string;
}

/**
 * Reads the scalar AWS::Cognito::* CloudFormation property values, failing
 * with a diagnostic naming the Resource type and the property.
 *
 * The Resource type is carried here because Cognito creates three of them, and
 * a message naming the wrong one would send a reader to the wrong template
 * entry. The logical ID is not: the CloudFormation engine already prefixes a
 * failed creation with it.
 *
 * `SimCfnCognitoPropertyParser` extends this with the lists and objects a
 * template also carries. The split is only that this half is about one value
 * at a time.
 */
export class SimCfnCognitoValueParser {
  protected readonly resourceType: string;

  constructor(properties: SimCfnCognitoValueParserProperties) {
    this.resourceType = properties.resourceType;
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
   * Parse a property value that must be a number when present.
   *
   * A numeric string is accepted for the same reason a boolean string is: a
   * template that quoted the number is one CloudFormation would deploy.
   */
  optionalNumber(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "number") {
      return value;
    }

    const parsed = typeof value === "string" ? Number(value) : NaN;

    if (Number.isNaN(parsed)) {
      throw this.invalidPropertyError(resource, label, "a number");
    }

    return parsed;
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
