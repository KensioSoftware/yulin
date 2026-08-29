import {
  simCfForwardedCookieBehaviors,
  simCfForwardedHeaderBehaviors,
  simCfForwardedQueryStringBehaviors,
  SimCfOriginRequestForwarding,
} from "../../origin-request-policy/sim-cf-origin-request-forwarding.js";
import {
  simCfnCfPolicySection,
  type SimCfnCfPolicyRefuse,
} from "../policy/sim-cfn-cf-policy-section.js";

/**
 * The three sections of an origin request policy, each with the fields
 * CloudFormation names it by and the behaviours CloudFront offers for it.
 *
 * The fields are the ones a cache policy writes. The header section is where
 * the two kinds part: an origin request policy can forward every header the
 * viewer sent, which is no use as a cache key.
 */
const cookiesSpec = {
  section: "CookiesConfig",
  behaviorField: "CookieBehavior",
  itemsField: "Cookies",
  behaviors: simCfForwardedCookieBehaviors,
  defaultBehavior: "none",
} as const;

const headersSpec = {
  section: "HeadersConfig",
  behaviorField: "HeaderBehavior",
  itemsField: "Headers",
  behaviors: simCfForwardedHeaderBehaviors,
  defaultBehavior: "none",
} as const;

const queryStringsSpec = {
  section: "QueryStringsConfig",
  behaviorField: "QueryStringBehavior",
  itemsField: "QueryStrings",
  behaviors: simCfForwardedQueryStringBehaviors,
  defaultBehavior: "none",
} as const;

/**
 * Read the three sections of an `OriginRequestPolicyConfig` into what the
 * policy forwards.
 *
 * A template leaving a section out gets CloudFront's own `none`. A policy that
 * says nothing forwards nothing.
 */
export function simCfnCfOriginRequestForwarding(
  config: Record<string, unknown>,
  refuse: SimCfnCfPolicyRefuse,
): SimCfOriginRequestForwarding {
  const cookies = simCfnCfPolicySection(config, cookiesSpec, refuse);
  const headers = simCfnCfPolicySection(config, headersSpec, refuse);
  const queries = simCfnCfPolicySection(config, queryStringsSpec, refuse);

  return new SimCfOriginRequestForwarding({
    cookieBehavior: cookies.behavior,
    cookies: cookies.items,
    headerBehavior: headers.behavior,
    headers: headers.items,
    queryStringBehavior: queries.behavior,
    queryStrings: queries.items,
  });
}
