import type { SimCfnResource } from "../../../../resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../template/value/sim-cfn-template-value.js";

/**
 * Reads one `Custom::CDKBucketDeployment` property, refusing a value of the
 * wrong shape by naming the property it came from.
 *
 * Keeping the reading here leaves `SimCdkBucketDeployProperties` saying what a
 * deployment is made of rather than how each part is checked.
 */
export class SimCdkBucketDeployValues {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(resource: SimCfnResource, properties: SimCfnTemplateValueRecord) {
    this.resource = resource;
    this.properties = properties;
  }

  /**
   * A property that has to be there and has to be a string.
   */
  requiredString(name: string): string {
    const value = this.optionalString(name);

    if (value === undefined) {
      this.refuse(`${name} must resolve to a string`);
    }

    return value;
  }

  /**
   * A string property, or nothing when the deployment does not set it.
   */
  optionalString(name: string): string | undefined {
    const value = this.value(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      this.refuse(`${name} must resolve to a string`);
    }

    return value;
  }

  /**
   * A list of strings, empty when the deployment does not set it.
   */
  stringList(name: string): readonly string[] {
    const value = this.value(name);

    if (value === undefined) {
      return [];
    }

    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string")
    ) {
      this.refuse(`${name} must be an array of strings`);
    }

    return value as readonly string[];
  }

  /**
   * A boolean property, falling back to the construct's own default.
   *
   * Anything other than a boolean is refused rather than read as truthy. This
   * is what `Prune` comes through, and pruning deletes Objects, so a `"false"`
   * quietly meaning `true` would delete the ones the template was keeping.
   */
  boolean(name: string, fallback: boolean): boolean {
    const value = this.value(name);

    if (value === undefined) {
      return fallback;
    }

    if (typeof value !== "boolean") {
      this.refuse(`${name} must be a boolean`);
    }

    return value;
  }

  /**
   * A record of header names to values, keyed lowercase as a stored Object
   * holds them.
   */
  headers(name: string): ReadonlyMap<string, string> {
    const value = this.value(name);

    if (value === undefined) {
      return new Map();
    }

    if (typeof value !== "object" || Array.isArray(value) || value === null) {
      this.refuse(`${name} must be an object`);
    }

    return new Map(
      Object.entries(value).map(([headerName, headerValue]) => {
        if (typeof headerValue !== "string") {
          this.refuse(`${name} ${headerName} must be a string`);
        }

        return [headerName.toLowerCase(), headerValue] as const;
      }),
    );
  }

  private value(name: string): unknown {
    // eslint-disable-next-line security/detect-object-injection -- name is a fixed property name from the caller
    return this.properties[name];
  }

  private refuse(detail: string): never {
    throw new TypeError(
      `Custom::CDKBucketDeployment ${this.resource.logicalId}: ${detail}`,
    );
  }
}
