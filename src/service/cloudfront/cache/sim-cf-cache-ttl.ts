import type { SimCloudFrontCachePolicy } from "../cache-policy/sim-cf-cache-policy.js";
import { simCfCacheControl } from "./sim-cf-cache-control.js";

interface SimCfCacheTtlProperties {
  /** The response the Origin answered with, whose headers carry the ask. */
  readonly response: Response;

  /** The Behavior's cache policy, whose three TTLs decide the answer. */
  readonly policy: SimCloudFrontCachePolicy;

  /** Now, off the simulation's clock, which `Expires` is measured from. */
  readonly now: Date;
}

/**
 * How many seconds a Distribution holds this response for. Zero says it holds
 * it not at all.
 *
 * The Origin asks and the policy decides how much of the ask to grant. An
 * Origin naming a duration gets it held between the policy's `MinTTL` and
 * `MaxTTL`, and one naming none gets the greater of `MinTTL` and `DefaultTTL`.
 * `s-maxage` is preferred to `max-age`, and `max-age` to `Expires`, which is
 * the order CloudFront reads them in.
 *
 * `no-store`, `no-cache` and `private` are respected where `MinTTL` is 0, and
 * held for `MinTTL` where it is higher. That last one is CloudFront's own
 * surprise. A policy with a floor overrides an Origin that asked for nothing to
 * be stored.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html
 */
export function simCfCacheTtlSec(properties: SimCfCacheTtlProperties): number {
  const { response, policy, now } = properties;
  const control = simCfCacheControl(response.headers.get("cache-control"));

  if (control.uncacheable) {
    return policy.minTtlSec;
  }

  const asked =
    control.sharedMaxAgeSec ??
    control.maxAgeSec ??
    expiresTtlSec(response, now);

  if (asked === undefined) {
    return Math.max(policy.minTtlSec, policy.defaultTtlSec);
  }

  return Math.min(Math.max(asked, policy.minTtlSec), policy.maxTtlSec);
}

/**
 * The seconds left until the `Expires` header's instant, or none where the
 * response carries no such header.
 *
 * A date already gone by counts as no seconds, which the policy's `MinTTL`
 * then raises where it has one. A value that is not a date counts the same
 * way, following RFC 9111, which reads an unparsable `Expires` as an object
 * that has already expired.
 */
function expiresTtlSec(response: Response, now: Date): number | undefined {
  const expires = response.headers.get("expires");

  if (expires === null) {
    return undefined;
  }

  const instant = Date.parse(expires);

  return Number.isNaN(instant) ? 0 : (instant - now.getTime()) / 1000;
}
