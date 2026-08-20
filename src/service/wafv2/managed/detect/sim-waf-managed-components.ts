import type { SimWafManagedDetector } from "../sim-waf-managed-rule.type.js";

/**
 * Whether one string carries what a managed rule is looking for.
 */
export type SimWafManagedPattern = (value: string) => boolean;

/**
 * Read a rule's pattern against the URI path.
 *
 * These six point one pattern at the component a rule reads.
 *
 * The managed rules come in families that run the same detection over a
 * different component each, which is what the `_BODY` and `_URIPATH` on the
 * end of a rule name says. Pairing a pattern with a component here is what
 * lets each rule be one line of the group it belongs to.
 *
 * A component that holds several strings matches when any of them does, as a
 * rule reading a set of query arguments or headers does on AWS.
 */
export function simWafInUriPath(
  pattern: SimWafManagedPattern,
): SimWafManagedDetector {
  return (parts): boolean => pattern(parts.uriPath);
}

/**
 * Read a rule's pattern against the query string.
 */
export function simWafInQueryString(
  pattern: SimWafManagedPattern,
): SimWafManagedDetector {
  return (parts): boolean => pattern(parts.queryString);
}

/**
 * Read a rule's pattern against every query argument.
 */
export function simWafInQueryArguments(
  pattern: SimWafManagedPattern,
): SimWafManagedDetector {
  return (parts): boolean => parts.queryArguments.some(pattern);
}

/**
 * Read a rule's pattern against as much of the body as WAF inspects.
 */
export function simWafInBody(
  pattern: SimWafManagedPattern,
): SimWafManagedDetector {
  return (parts): boolean => pattern(parts.body);
}

/**
 * Read a rule's pattern against the whole cookie header.
 */
export function simWafInCookies(
  pattern: SimWafManagedPattern,
): SimWafManagedDetector {
  return (parts): boolean => pattern(parts.cookieHeader);
}

/**
 * Read a rule's pattern against every header the request sent.
 */
export function simWafInHeaders(
  pattern: SimWafManagedPattern,
): SimWafManagedDetector {
  return (parts): boolean => parts.headerValues.some(pattern);
}
