import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Read a required string property off a Route53 DNSSEC Resource.
 *
 * Both DNSSEC Resource types are only strings, and every one of them is
 * required, so this is the whole of their property parsing. The value is
 * passed in rather than the property looked up here, matching the other
 * property parsers, so the property names stay literals at their call sites.
 */
export function simCfnRoute53String(
  resource: SimCfnResource,
  value: SimCfnTemplateValue | undefined,
  resourceType: string,
  name: string,
): string {
  if (typeof value !== "string") {
    throw new TypeError(
      `Invalid ${resourceType} ${resource.logicalId}: ${name} must be a string`,
    );
  }

  return value;
}
