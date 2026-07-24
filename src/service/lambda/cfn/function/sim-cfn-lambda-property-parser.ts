import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Validates individual AWS::Lambda::Function CloudFormation property values,
 * failing with a diagnostic naming the property and the logical ID.
 */
export class SimCfnLambdaPropertyParser {
  /**
   * Parse a property value that must be a string.
   */
  requiredString(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string {
    if (typeof value !== "string") {
      throw this.invalidPropertyError(resource, label, "a string");
    }

    return value;
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

    return this.requiredString(resource, value, label);
  }

  /**
   * Parse a property value that must be a number when present.
   */
  optionalNumber(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "number") {
      throw this.invalidPropertyError(resource, label, "a number");
    }

    return value;
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
      `Invalid AWS::Lambda::Function ${resource.logicalId}: ${label} must be ${expected}`,
    );
  }
}
