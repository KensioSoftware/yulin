import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Validates individual AWS::Lambda::* CloudFormation property values, failing
 * with a diagnostic naming the Resource type, the property and the logical ID.
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
   * Parse a property value that must be a boolean when present.
   */
  optionalBoolean(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "boolean") {
      throw this.invalidPropertyError(resource, label, "a boolean");
    }

    return value;
  }

  /**
   * Parse a property value that must be a record of strings when present.
   *
   * CloudFormation has no typed map, so every value has to be checked: a
   * template that puts a number or a nested object where a string belongs
   * should fail here rather than reach the function as a non-string.
   */
  optionalStringRecord(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): Record<string, string> | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!isRecord(value)) {
      throw this.invalidPropertyError(resource, label, "an object");
    }

    const entries: [string, string][] = Object.entries(value).map(
      ([key, entryValue]) => [
        key,
        this.requiredString(resource, entryValue, `${label}.${key}`),
      ],
    );

    return Object.fromEntries(entries);
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
      `Invalid ${resource.type ?? "AWS::Lambda::Function"} ` +
        `${resource.logicalId}: ${label} must be ${expected}`,
    );
  }
}
