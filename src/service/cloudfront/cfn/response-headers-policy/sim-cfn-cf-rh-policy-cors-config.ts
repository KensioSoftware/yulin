import { SimCloudFrontResponseHeadersPolicyCors } from "../../response-headers-policy/sim-cf-response-headers-policy-cors.js";
import {
  optionalObject,
  requiredBoolean,
  type SimCfnCfRhPolicyFieldRefuse,
} from "./sim-cfn-cf-rh-policy-field-reader.js";

/**
 * Reads a ResponseHeadersPolicyConfig's CorsConfig section into the CORS
 * model that applies it at request time.
 *
 * Split from the config reader that calls it for the same reason as
 * simCfnCfResponseHeadersPolicySecurityHeaders: this project holds every
 * source file to a line count, and CORS has enough of its own fields to
 * reach it alongside the rest of the policy.
 */
export function simCfnCfResponseHeadersPolicyCors(
  config: Record<string, unknown>,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): SimCloudFrontResponseHeadersPolicyCors | undefined {
  const section = optionalObject(config, "CorsConfig", "CorsConfig", refuse);

  if (section === undefined) {
    return undefined;
  }

  const maxAgeSec = section["AccessControlMaxAgeSec"];

  if (maxAgeSec !== undefined && typeof maxAgeSec !== "number") {
    refuse(`CorsConfig AccessControlMaxAgeSec must be a number`);
  }

  return new SimCloudFrontResponseHeadersPolicyCors({
    allowCredentials: requiredBoolean(
      section,
      "AccessControlAllowCredentials",
      "CorsConfig",
      refuse,
    ),
    allowHeaders: originList(section, "AccessControlAllowHeaders", refuse),
    allowMethods: originList(section, "AccessControlAllowMethods", refuse),
    allowOrigins: originList(section, "AccessControlAllowOrigins", refuse),
    exposeHeaders: originList(section, "AccessControlExposeHeaders", refuse),
    ...(maxAgeSec !== undefined && { maxAgeSec }),
    originOverride: requiredBoolean(
      section,
      "OriginOverride",
      "CorsConfig",
      refuse,
    ),
  });
}

/**
 * The string `Items` of one `AccessControl*` field, which CloudFront requires
 * whenever the field itself is present.
 */
function originList(
  section: Record<string, unknown>,
  fieldName: string,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): string[] {
  const field = optionalObject(
    section,
    fieldName,
    `CorsConfig ${fieldName}`,
    refuse,
  );

  if (field === undefined) {
    return [];
  }

  const items = field["Items"];

  if (!Array.isArray(items)) {
    refuse(`CorsConfig ${fieldName} needs an array Items`);
  }

  return items.map((item) => {
    if (typeof item !== "string") {
      refuse(`CorsConfig ${fieldName} Items must be strings`);
    }

    return item;
  });
}
