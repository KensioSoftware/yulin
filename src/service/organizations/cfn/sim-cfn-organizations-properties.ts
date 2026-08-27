import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Reading the properties of an `AWS::Organizations::*` Resource.
 *
 * Each property is passed in by the caller under its own literal name, the way
 * the other services read a template. A required one that is absent or of the
 * wrong shape fails the Resource rather than quietly creating something else.
 */
export class SimCfnOrganizationsProperties {
  readonly #resource: SimCfnResource;
  readonly #resourceType: string;

  constructor(resource: SimCfnResource, resourceType: string) {
    this.#resource = resource;
    this.#resourceType = resourceType;
  }

  /**
   * A property that has to be a string for the Resource to mean anything.
   */
  requiredString(value: SimCfnTemplateValue | undefined, name: string): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(
        `${this.#resourceType} ${this.#resource.logicalId} requires ${name}`,
      );
    }

    return value;
  }

  /**
   * A property that is a string where a template gives one.
   */
  optionalString(value: SimCfnTemplateValue | undefined): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  /**
   * A list-valued property, read as the strings in it.
   *
   * A template may give one value where a list is allowed, which
   * CloudFormation accepts, so a bare string reads as a list of one.
   */
  stringList(value: SimCfnTemplateValue | undefined): readonly string[] {
    if (typeof value === "string") {
      return [value];
    }

    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === "string");
  }

  /**
   * A property holding an IAM policy document, given inline or as JSON text.
   */
  documentValue(value: SimCfnTemplateValue | undefined, name: string): unknown {
    if (typeof value !== "string") {
      return value;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error(
        `${this.#resourceType} ${this.#resource.logicalId} ${name} is not ` +
          `valid JSON`,
      );
    }
  }

  /**
   * Record a property the simulation creates the Resource without acting on.
   */
  ignore(
    value: SimCfnTemplateValue | undefined,
    name: string,
    reason: string,
  ): void {
    if (value !== undefined) {
      this.#resource.ignoreProperty(name, reason);
    }
  }
}
