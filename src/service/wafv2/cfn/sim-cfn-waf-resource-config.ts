import { SimCfnGeneratedResourceName } from "../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnWafResourceError } from "./sim-cfn-waf-resource-error.js";

/**
 * How long a WAFv2 resource name may be, which is the same for all three of
 * the named types.
 */
const maximumNameLength = 128;

export interface SimCfnWafResourceConfigProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * What the three named WAFv2 Resource types read the same way.
 *
 * A web ACL, an IP set and a regex pattern set are each named within a scope
 * and carry an optional description, and each is created through the ordinary
 * WAFv2 command for it. What is left to a subclass is the handful of
 * properties that say which of the three it is.
 *
 * The scope is read as whatever the template wrote and handed straight to the
 * command, which refuses anything that is not `CLOUDFRONT` or `REGIONAL` and
 * refuses `CLOUDFRONT` outside `us-east-1`. Deciding it here as well would be
 * a second answer to a question WAFv2 already answers.
 */
export abstract class SimCfnWafResourceConfig {
  protected readonly resource: SimCfnResource;
  protected readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: SimCfnWafResourceConfigProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * The CloudFormation Resource type this reads, as a refusal names it.
   */
  protected abstract get resourceType(): string;

  /**
   * The resource name.
   *
   * `Name` is optional on all three types, and an unnamed resource is named
   * after the stack and the logical ID as real CloudFormation names one. The
   * name is part of the ARN and of what `Ref` answers with, so a template that
   * leaves it out still gets something a test can predict.
   */
  name(): string {
    const name = this.text("Name");

    return (
      name ??
      new SimCfnGeneratedResourceName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
        maximumLength: maximumNameLength,
      }).value
    );
  }

  /**
   * The scope the resource belongs to, as the template wrote it.
   */
  scope(): string | undefined {
    return this.text("Scope");
  }

  /**
   * The description, when the template gave one.
   */
  description(): string | undefined {
    return this.text("Description");
  }

  /**
   * One property of the Resource, whatever shape it is in.
   */
  protected value(key: string): SimCfnTemplateValue | undefined {
    // oxlint-disable-next-line security/detect-object-injection
    return this.properties[key] ?? undefined;
  }

  /**
   * One string property, or nothing when the template left it out.
   */
  protected text(key: string): string | undefined {
    const value = this.value(key);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      this.refuse(`${key} must be a string`);
    }

    return value;
  }

  /**
   * One list-of-strings property, or nothing when the template left it out.
   */
  protected strings(key: string): readonly string[] | undefined {
    const value = this.value(key);

    if (value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      this.refuse(`${key} must be a list`);
    }

    return value.map((entry) => {
      if (typeof entry !== "string") {
        this.refuse(`every entry of ${key} must be a string`);
      }

      return entry;
    });
  }

  /**
   * Refuse this Resource, saying which part of it could not be read.
   */
  protected refuse(reason: string): never {
    throw simCfnWafResourceError(
      this.resourceType,
      this.resource.logicalId,
      reason,
    );
  }
}
