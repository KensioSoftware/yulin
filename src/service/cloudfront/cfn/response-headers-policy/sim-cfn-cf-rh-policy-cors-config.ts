import { simCfCorsOriginPatternIsValid } from "../../response-headers-policy/sim-cf-cors-origin-pattern.js";
import { SimCloudFrontResponseHeadersPolicyCors } from "../../response-headers-policy/sim-cf-response-headers-policy-cors.js";
import {
  optionalObject,
  requiredBoolean,
  requiredInteger,
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

  const maxAgeSec =
    section["AccessControlMaxAgeSec"] === undefined
      ? undefined
      : requiredInteger(
          section,
          "AccessControlMaxAgeSec",
          "CorsConfig",
          refuse,
        );

  return new SimCloudFrontResponseHeadersPolicyCors({
    allowCredentials: requiredBoolean(
      section,
      "AccessControlAllowCredentials",
      "CorsConfig",
      refuse,
    ),
    allowHeaders: requiredList(section, "AccessControlAllowHeaders", refuse),
    allowMethods: requiredList(section, "AccessControlAllowMethods", refuse),
    allowOrigins: allowOrigins(section, refuse),
    exposeHeaders: optionalList(section, "AccessControlExposeHeaders", refuse),
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
 * The allowed Origins, each of which must place its wildcard where CloudFront
 * allows one, since an entry it would refuse could never match here either.
 */
function allowOrigins(
  section: Record<string, unknown>,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): string[] {
  const origins = requiredList(section, "AccessControlAllowOrigins", refuse);

  for (const origin of origins) {
    if (!simCfCorsOriginPatternIsValid(origin)) {
      refuse(
        `CorsConfig AccessControlAllowOrigins ${origin} may only use the ` +
          `wildcard on its own or as the leftmost subdomain, as in ` +
          `*.example.org`,
      );
    }
  }

  return origins;
}

/**
 * The string `Items` of a field CloudFront requires a CORS section to carry.
 */
function requiredList(
  section: Record<string, unknown>,
  fieldName: string,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): string[] {
  // oxlint-disable-next-line security/detect-object-injection
  if (section[fieldName] === undefined) {
    refuse(`CorsConfig needs an ${fieldName}`);
  }

  return optionalList(section, fieldName, refuse);
}

/**
 * The string `Items` of one `AccessControl*` field, or nothing when the field
 * is absent. `Items` itself is required whenever the field is present.
 */
function optionalList(
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
