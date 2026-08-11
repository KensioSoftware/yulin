import { SimCloudFrontResponseHeader } from "../../response-headers-policy/sim-cf-response-header.js";
import {
  optionalObject,
  requiredBoolean,
  type SimCfnCfRhPolicyFieldRefuse,
} from "./sim-cfn-cf-rh-policy-field-reader.js";
import { simCfnCfRhPolicySecurityHeaders } from "./sim-cfn-cf-rh-policy-security-values.js";

/**
 * Reads a ResponseHeadersPolicyConfig's SecurityHeadersConfig section into
 * the header CloudFront documents for each of its sub-sections.
 *
 * Every sub-section carries its own `Override`, unlike the CORS section whose
 * one `OriginOverride` decides all of its headers together.
 */
export function simCfnCfResponseHeadersPolicySecurityHeaders(
  config: Record<string, unknown>,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): SimCloudFrontResponseHeader[] {
  const section = optionalObject(
    config,
    "SecurityHeadersConfig",
    "SecurityHeadersConfig",
    refuse,
  );

  if (section === undefined) {
    return [];
  }

  return simCfnCfRhPolicySecurityHeaders
    .map(([subsection, name, value]) => {
      const context = `SecurityHeadersConfig ${subsection}`;
      const item = optionalObject(section, subsection, context, refuse);

      return item === undefined
        ? undefined
        : new SimCloudFrontResponseHeader({
            name,
            value: value(item, context, refuse),
            override: requiredBoolean(item, "Override", context, refuse),
          });
    })
    .filter((h): h is SimCloudFrontResponseHeader => h !== undefined);
}
