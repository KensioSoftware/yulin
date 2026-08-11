import { SimCloudFrontResponseHeader } from "../../response-headers-policy/sim-cf-response-header.js";
import {
  optionalObject,
  requiredBoolean,
  requiredNumber,
  requiredString,
  type SimCfnCfRhPolicyFieldRefuse,
} from "./sim-cfn-cf-rh-policy-field-reader.js";

/**
 * Reads a ResponseHeadersPolicyConfig's SecurityHeadersConfig section into
 * the header CloudFront documents for each of its sub-sections.
 *
 * Split from the config reader that calls it so that file stays under the
 * line count this project holds every source file to, not because the two
 * are conceptually separate: this is still config reading, just for one
 * section with six sub-sections of its own.
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

  const header = (
    subsectionName: string,
    headerName: string,
    value: (item: Record<string, unknown>, context: string) => string,
  ): SimCloudFrontResponseHeader | undefined => {
    const context = `SecurityHeadersConfig ${subsectionName}`;
    const item = optionalObject(section, subsectionName, context, refuse);

    if (item === undefined) {
      return undefined;
    }

    return new SimCloudFrontResponseHeader({
      name: headerName,
      value: value(item, context),
      override: requiredBoolean(item, "Override", context, refuse),
    });
  };

  return [
    header(
      "ContentSecurityPolicy",
      "Content-Security-Policy",
      (item, context) =>
        requiredString(item, "ContentSecurityPolicy", context, refuse),
    ),
    header("ContentTypeOptions", "X-Content-Type-Options", () => "nosniff"),
    header("FrameOptions", "X-Frame-Options", (item, context) =>
      requiredString(item, "FrameOption", context, refuse),
    ),
    header("ReferrerPolicy", "Referrer-Policy", (item, context) =>
      requiredString(item, "ReferrerPolicy", context, refuse),
    ),
    header(
      "StrictTransportSecurity",
      "Strict-Transport-Security",
      (item, context) => strictTransportSecurityValue(item, context, refuse),
    ),
    header("XSSProtection", "X-XSS-Protection", (item, context) =>
      xssProtectionValue(item, context, refuse),
    ),
  ].filter((h): h is SimCloudFrontResponseHeader => h !== undefined);
}

function strictTransportSecurityValue(
  item: Record<string, unknown>,
  context: string,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): string {
  const directives = [
    `max-age=${requiredNumber(item, "AccessControlMaxAgeSec", context, refuse)}`,
  ];

  if (item["IncludeSubdomains"] === true) {
    directives.push("includeSubDomains");
  }

  if (item["Preload"] === true) {
    directives.push("preload");
  }

  return directives.join("; ");
}

function xssProtectionValue(
  item: Record<string, unknown>,
  context: string,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): string {
  if (!requiredBoolean(item, "Protection", context, refuse)) {
    return "0";
  }

  if (item["ModeBlock"] === true) {
    return "1; mode=block";
  }

  const reportUri = item["ReportUri"];

  return typeof reportUri === "string" ? `1; report=${reportUri}` : "1";
}
