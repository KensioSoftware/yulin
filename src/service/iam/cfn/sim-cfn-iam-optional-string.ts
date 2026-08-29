import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

interface SimCfnIamOptionalStringProperties {
  readonly resourceType: string;
  readonly resource: SimCfnResource;
  readonly value: SimCfnTemplateValueRecord[string] | undefined;
  readonly label: string;
}

/**
 * Read a string property an IAM Resource may leave out.
 *
 * A Role and a User read most of their own properties this way, and both
 * refuse a non-string the same way, naming the Resource type the template
 * declared.
 */
export function simCfnIamOptionalString(
  properties: SimCfnIamOptionalStringProperties,
): string | undefined {
  const { resourceType, resource, value, label } = properties;

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new TypeError(
      `Invalid ${resourceType} ${resource.logicalId}: ${label} must be a string`,
    );
  }

  return value;
}
