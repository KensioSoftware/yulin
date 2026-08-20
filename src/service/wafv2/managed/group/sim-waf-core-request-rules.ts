import { simWafDetectsBadBot } from "../detect/sim-waf-managed-patterns.js";
import { simWafManagedSizeLimits } from "../detect/sim-waf-managed-sizes.js";
import type { SimWafManagedRuleDefinition } from "../sim-waf-managed-rule.type.js";

/**
 * The core rule set rules that read the request itself, in AWS's order.
 *
 * These are the first six rules of the group, and the four size restrictions
 * among them are the ones AWS documents a figure for. They are the rules most
 * likely to claim an application's own traffic, and the ones a team therefore
 * meets first.
 */
export const simWafCoreRequestRules: readonly SimWafManagedRuleDefinition[] = [
  {
    name: "NoUserAgent_HEADER",
    label: "NoUserAgent_Header",
    tier: "exact",
    detects: (parts): boolean =>
      parts.userAgent === undefined || parts.userAgent === "",
  },
  {
    name: "UserAgent_BadBots_HEADER",
    label: "UserAgent_BadBots_Header",
    tier: "documented",
    detects: (parts): boolean =>
      parts.userAgent !== undefined && simWafDetectsBadBot(parts.userAgent),
  },
  {
    name: "SizeRestrictions_QUERYSTRING",
    label: "SizeRestrictions_QueryString",
    tier: "exact",
    detects: (parts): boolean =>
      parts.queryStringBytes > simWafManagedSizeLimits.queryString,
  },
  {
    name: "SizeRestrictions_Cookie_HEADER",
    label: "SizeRestrictions_Cookie_Header",
    tier: "exact",
    detects: (parts): boolean =>
      parts.cookieHeaderBytes > simWafManagedSizeLimits.cookieHeader,
  },
  {
    name: "SizeRestrictions_BODY",
    label: "SizeRestrictions_Body",
    tier: "exact",
    detects: (parts): boolean => parts.bodyBytes > simWafManagedSizeLimits.body,
  },
  {
    name: "SizeRestrictions_URIPATH",
    label: "SizeRestrictions_URIPath",
    tier: "exact",
    detects: (parts): boolean =>
      parts.uriPathBytes > simWafManagedSizeLimits.uriPath,
  },
];
