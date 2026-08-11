import { isRecord } from "../../../../util/type-guard/record.js";
import { SimCloudFrontResponseHeader } from "../../response-headers-policy/sim-cf-response-header.js";
import {
  sectionItems,
  type SimCfnCfRhPolicyFieldRefuse,
} from "./sim-cfn-cf-rh-policy-field-reader.js";

/**
 * Reads a ResponseHeadersPolicyConfig's CustomHeadersConfig section into the
 * headers it adds.
 *
 * Split from the config reader that calls it for the same reason as
 * simCfnCfResponseHeadersPolicySecurityHeaders: this project holds every
 * source file to a line count.
 */
export function simCfnCfResponseHeadersPolicyCustomHeaders(
  config: Record<string, unknown>,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): SimCloudFrontResponseHeader[] {
  return sectionItems(config, "CustomHeadersConfig", refuse).map((item) => {
    if (!isRecord(item)) {
      refuse(`CustomHeadersConfig items must be objects`);
    }

    const name = item["Header"];
    const value = item["Value"];

    if (typeof name !== "string" || typeof value !== "string") {
      refuse(`CustomHeadersConfig items need a string Header and Value`);
    }

    // Override is required by the CloudFormation schema, so anything else
    // here is a template that would be refused before it reached a policy at
    // all.
    const override = item["Override"];

    if (typeof override !== "boolean") {
      refuse(`CustomHeadersConfig item ${name} needs a boolean Override`);
    }

    return new SimCloudFrontResponseHeader({ name, value, override });
  });
}

/**
 * Reads a ResponseHeadersPolicyConfig's RemoveHeadersConfig section into the
 * header names it removes.
 */
export function simCfnCfResponseHeadersPolicyRemoveHeaders(
  config: Record<string, unknown>,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): string[] {
  return sectionItems(config, "RemoveHeadersConfig", refuse).map((item) => {
    const name = isRecord(item) ? item["Header"] : undefined;

    if (typeof name !== "string") {
      refuse(`RemoveHeadersConfig items need a string Header`);
    }

    return name;
  });
}
