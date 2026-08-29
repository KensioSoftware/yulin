import { isRecord } from "../../../../util/type-guard/record.js";
import { SimCloudFrontCacheKey } from "../../cache-policy/sim-cf-cache-key.js";
import {
  simCfnCfPolicySection,
  type SimCfnCfPolicyRefuse,
} from "../policy/sim-cfn-cf-policy-section.js";
import {
  simCfnCfCookiesSpec,
  simCfnCfHeadersSpec,
  simCfnCfQueryStringsSpec,
} from "./sim-cfn-cf-cache-policy-section.js";

const parametersField = "ParametersInCacheKeyAndForwardedToOrigin";

/**
 * Read the `ParametersInCacheKeyAndForwardedToOrigin` of a
 * `CachePolicyConfig` into the cache key a policy carries.
 *
 * A template leaving the whole thing out gets CloudFront's own `none` in all
 * three sections, with neither compression flag set.
 */
export function simCfnCfCachePolicyCacheKey(
  config: Record<string, unknown>,
  refuse: SimCfnCfPolicyRefuse,
): SimCloudFrontCacheKey {
  // oxlint-disable-next-line security/detect-object-injection
  const parameters = config[parametersField];

  if (parameters === undefined) {
    return new SimCloudFrontCacheKey();
  }

  if (!isRecord(parameters)) {
    return refuse(`${parametersField} must be an object`);
  }

  const cookies = simCfnCfPolicySection(
    parameters,
    simCfnCfCookiesSpec,
    refuse,
  );
  const headers = simCfnCfPolicySection(
    parameters,
    simCfnCfHeadersSpec,
    refuse,
  );
  const queries = simCfnCfPolicySection(
    parameters,
    simCfnCfQueryStringsSpec,
    refuse,
  );

  return new SimCloudFrontCacheKey({
    cookieBehavior: cookies.behavior,
    cookies: cookies.items,
    headerBehavior: headers.behavior,
    headers: headers.items,
    queryStringBehavior: queries.behavior,
    queryStrings: queries.items,
    enableAcceptEncodingGzip: encodingFlag(parameters, "Gzip", refuse),
    enableAcceptEncodingBrotli: encodingFlag(parameters, "Brotli", refuse),
  });
}

/**
 * One of the two flags that put the normalized `Accept-Encoding` header in the
 * cache key. Both are off where a template says nothing.
 */
function encodingFlag(
  parameters: Record<string, unknown>,
  encoding: string,
  refuse: SimCfnCfPolicyRefuse,
): boolean {
  const field = `EnableAcceptEncoding${encoding}`;
  // oxlint-disable-next-line security/detect-object-injection
  const value = parameters[field];

  if (value === undefined) {
    return false;
  }

  return typeof value === "boolean"
    ? value
    : refuse(`${parametersField} ${field} must be a boolean`);
}
