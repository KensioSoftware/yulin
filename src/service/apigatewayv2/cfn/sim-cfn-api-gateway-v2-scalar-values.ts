import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Reads the single-value shapes an AWS::ApiGatewayV2::* property can take.
 *
 * The lists and objects are `SimCfnApiGatewayV2PropertyValues` above this, and
 * they are built out of these readers, so the rules for what one string or one
 * number may be are stated once whether it stands alone or sits in a list.
 *
 * The Resource type is carried so a message names the template entry a reader
 * has to go and fix.
 */
export class SimCfnApiGatewayV2ScalarValues {
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
   * Parse a property value that must be a number when present, which is the
   * shape an authorizer's `AuthorizerResultTtlInSeconds` takes.
   *
   * CloudFormation carries template numbers as strings in places, the same way
   * it does booleans, so a string holding a number is read as that number.
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

    const parsed = this.numberString(value);

    if (parsed === undefined) {
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

  /**
   * The number a template string holds, when it holds one.
   */
  private numberString(value: SimCfnTemplateValue): number | undefined {
    if (typeof value !== "string" || value.trim().length === 0) {
      return undefined;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      return undefined;
    }

    return parsed;
  }
}
