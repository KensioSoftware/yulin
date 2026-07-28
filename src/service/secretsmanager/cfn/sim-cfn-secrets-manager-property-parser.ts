import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSecretsManagerTag } from "../secret/sim-secrets-manager-secret.js";

/**
 * Validates individual AWS::SecretsManager::* CloudFormation property values,
 * failing with a diagnostic naming the Resource type, the property and the
 * logical ID.
 */
export class SimCfnSecretsManagerPropertyParser {
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
   * Parse a property value that must be a number when present.
   *
   * CloudFormation carries template numbers as strings often enough that a
   * numeric string is accepted here, as CloudFormation itself accepts one.
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

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    throw this.invalidPropertyError(resource, label, "a number");
  }

  /**
   * Parse a property value that must be a boolean when present.
   *
   * CloudFormation carries template booleans as the strings "true" and
   * "false" in places, so both forms are accepted, as CloudFormation itself
   * accepts them.
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
   * Parse a property value that must be an object when present.
   */
  optionalRecord(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): SimCfnTemplateValueRecord | undefined {
    if (value === undefined) {
      return undefined;
    }

    return this.record(resource, value, label);
  }

  /**
   * Parse the Tags property, which CloudFormation carries as a list of
   * Key/Value pairs.
   */
  optionalTags(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): readonly SimSecretsManagerTag[] | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw this.invalidPropertyError(resource, label, "a list");
    }

    return value.map((entry, index) => {
      const entryLabel = `${label}.${String(index)}`;
      const tag = this.record(resource, entry, entryLabel);

      return {
        Key: this.optionalString(resource, tag["Key"], `${entryLabel}.Key`),
        Value: this.optionalString(
          resource,
          tag["Value"],
          `${entryLabel}.Value`,
        ),
      };
    });
  }

  /**
   * Build the diagnostic error for a malformed property value.
   *
   * AWS::SecretsManager::Secret is the only Resource type this simulator
   * creates, so it is named here rather than read from the Resource.
   */
  invalidPropertyError(
    resource: SimCfnResource,
    label: string,
    expected: string,
  ): TypeError {
    return new TypeError(
      `Invalid AWS::SecretsManager::Secret ${resource.logicalId}: ` +
        `${label} must be ${expected}`,
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
