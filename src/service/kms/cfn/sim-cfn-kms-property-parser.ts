import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";

interface SimCfnKmsPropertyParserProperties {
  readonly resourceType: string;
}

/**
 * Validates individual AWS::KMS::* CloudFormation property values, failing
 * with a diagnostic naming the Resource type, the property and the logical ID.
 *
 * The Resource type is carried here because KMS creates two of them, and a
 * message naming the wrong one would send a reader to the wrong template
 * entry.
 */
export class SimCfnKmsPropertyParser {
  private readonly resourceType: string;

  constructor(properties: SimCfnKmsPropertyParserProperties) {
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
   * Parse a policy document property, which CloudFormation carries as an
   * object but which the KMS API takes as a JSON string.
   *
   * A string is passed through so a template that inlined the JSON itself
   * still works, which is what CDK's `PolicyDocument.toJSON` output and a
   * hand-written `!Sub` both end up producing.
   */
  optionalPolicyJson(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "string") {
      return value;
    }

    return JSON.stringify(this.record(resource, value, label));
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
   * Build the diagnostic error for a Resource this simulator refuses.
   */
  propertyError(resource: SimCfnResource, reason: string): Error {
    return new Error(
      `Invalid ${this.resourceType} Resource ${resource.logicalId}: ${reason}`,
    );
  }

  /**
   * Narrow a template value to an object, refusing anything else.
   */
  private record(
    resource: SimCfnResource,
    value: SimCfnTemplateValue,
    label: string,
  ): SimCfnTemplateValueRecord {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw this.invalidPropertyError(resource, label, "an object");
    }

    return value;
  }
}
