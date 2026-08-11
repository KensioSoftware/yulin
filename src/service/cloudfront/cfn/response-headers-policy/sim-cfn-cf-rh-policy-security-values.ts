import {
  requiredBoolean,
  requiredEnum,
  requiredInteger,
  requiredString,
  type SimCfnCfRhPolicyFieldRefuse,
} from "./sim-cfn-cf-rh-policy-field-reader.js";

/**
 * The header value each SecurityHeadersConfig sub-section describes.
 *
 * Split from the section reader that dispatches to them so that file stays a
 * table of which sub-section sets which header, under the line count this
 * project holds every source file to.
 */
export type SimCfnCfRhPolicySecurityValue = (
  item: Record<string, unknown>,
  context: string,
  refuse: SimCfnCfRhPolicyFieldRefuse,
) => string;

/** The only two directives CloudFront accepts for `X-Frame-Options`. */
const frameOptions = ["DENY", "SAMEORIGIN"] as const;

/** The referrer policy directives CloudFront accepts. */
const referrerPolicies = [
  "no-referrer",
  "no-referrer-when-downgrade",
  "origin",
  "origin-when-cross-origin",
  "same-origin",
  "strict-origin",
  "strict-origin-when-cross-origin",
  "unsafe-url",
] as const;

const contentSecurityPolicyValue: SimCfnCfRhPolicySecurityValue = (
  item,
  context,
  refuse,
) => requiredString(item, "ContentSecurityPolicy", context, refuse);

const contentTypeOptionsValue: SimCfnCfRhPolicySecurityValue = () => "nosniff";

const frameOptionValue: SimCfnCfRhPolicySecurityValue = (
  item,
  context,
  refuse,
) => requiredEnum(item, "FrameOption", frameOptions, context, refuse);

const referrerPolicyValue: SimCfnCfRhPolicySecurityValue = (
  item,
  context,
  refuse,
) => requiredEnum(item, "ReferrerPolicy", referrerPolicies, context, refuse);

const strictTransportSecurityValue: SimCfnCfRhPolicySecurityValue = (
  item,
  context,
  refuse,
) => {
  const directives = [
    `max-age=${requiredInteger(item, "AccessControlMaxAgeSec", context, refuse)}`,
  ];

  if (item["IncludeSubdomains"] === true) {
    directives.push("includeSubDomains");
  }

  if (item["Preload"] === true) {
    directives.push("preload");
  }

  return directives.join("; ");
};

/**
 * CloudFront refuses a reporting URI alongside `ModeBlock`, since the header
 * carries one directive or the other and not both.
 */
const xssProtectionValue: SimCfnCfRhPolicySecurityValue = (
  item,
  context,
  refuse,
) => {
  const modeBlock = item["ModeBlock"] === true;
  const reportUri = item["ReportUri"];

  if (reportUri !== undefined && typeof reportUri !== "string") {
    return refuse(`${context} ReportUri must be a string`);
  }

  if (modeBlock && reportUri !== undefined) {
    return refuse(`${context} cannot set both ModeBlock and ReportUri`);
  }

  if (!requiredBoolean(item, "Protection", context, refuse)) {
    return "0";
  }

  if (modeBlock) {
    return "1; mode=block";
  }

  return reportUri === undefined ? "1" : `1; report=${reportUri}`;
};

/**
 * Which sub-section of a SecurityHeadersConfig sets which response header,
 * and what builds its value.
 */
export const simCfnCfRhPolicySecurityHeaders: readonly (readonly [
  string,
  string,
  SimCfnCfRhPolicySecurityValue,
])[] = [
  [
    "ContentSecurityPolicy",
    "Content-Security-Policy",
    contentSecurityPolicyValue,
  ],
  ["ContentTypeOptions", "X-Content-Type-Options", contentTypeOptionsValue],
  ["FrameOptions", "X-Frame-Options", frameOptionValue],
  ["ReferrerPolicy", "Referrer-Policy", referrerPolicyValue],
  [
    "StrictTransportSecurity",
    "Strict-Transport-Security",
    strictTransportSecurityValue,
  ],
  ["XSSProtection", "X-XSS-Protection", xssProtectionValue],
];
