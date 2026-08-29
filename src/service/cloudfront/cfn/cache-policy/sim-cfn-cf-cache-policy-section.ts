import {
  simCfCacheKeyCookieBehaviors,
  simCfCacheKeyHeaderBehaviors,
  simCfCacheKeyQueryStringBehaviors,
} from "../../cache-policy/sim-cf-cache-key.js";

/**
 * The three sections of a cache key, each with the fields CloudFormation
 * names it by and the behaviours CloudFront offers for it.
 *
 * An origin request policy writes the same three sections under the same field
 * names, and `simCfnCfPolicySection` reads either kind from a spec like these.
 */
export const simCfnCfCookiesSpec = {
  section: "CookiesConfig",
  behaviorField: "CookieBehavior",
  itemsField: "Cookies",
  behaviors: simCfCacheKeyCookieBehaviors,
  defaultBehavior: "none",
} as const;

export const simCfnCfHeadersSpec = {
  section: "HeadersConfig",
  behaviorField: "HeaderBehavior",
  itemsField: "Headers",
  behaviors: simCfCacheKeyHeaderBehaviors,
  defaultBehavior: "none",
} as const;

export const simCfnCfQueryStringsSpec = {
  section: "QueryStringsConfig",
  behaviorField: "QueryStringBehavior",
  itemsField: "QueryStrings",
  behaviors: simCfCacheKeyQueryStringBehaviors,
  defaultBehavior: "none",
} as const;
