import { simCfNormalizedAcceptEncoding } from "../cache/sim-cf-accept-encoding.js";
import { SimCloudFrontCacheKey } from "../cache-policy/sim-cf-cache-key.js";
import {
  SimCfOriginRequestForwarding,
  type SimCfForwardedCookieBehavior,
  type SimCfForwardedHeaderBehavior,
} from "./sim-cf-origin-request-forwarding.js";

interface SimCfForwardedToOriginProperties {
  readonly cacheKey?: SimCloudFrontCacheKey | undefined;
  readonly forwarding?: SimCfOriginRequestForwarding | undefined;
}

/**
 * What a cache Behavior carries to its Origin.
 *
 * CloudFront sends the union of two things. The first is what the cache policy
 * keyed the cache on, since an Origin has to be able to answer for the key it
 * is asked about. The second is what the origin request policy forwards on
 * top. A Behavior naming neither policy carries neither, and its Origin reads
 * only what CloudFront sends of its own accord.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-origin-requests.html
 */
export class SimCfForwardedToOrigin {
  private readonly cacheKey: SimCloudFrontCacheKey;
  private readonly forwarding: SimCfOriginRequestForwarding;

  constructor(properties: SimCfForwardedToOriginProperties = {}) {
    this.cacheKey = properties.cacheKey ?? new SimCloudFrontCacheKey();
    this.forwarding =
      properties.forwarding ?? new SimCfOriginRequestForwarding();
  }

  /**
   * Whether one of the viewer's headers travels to the Origin, by a name read
   * case insensitively as HTTP reads a header name.
   */
  forwardsHeader(name: string): boolean {
    return (
      (this.cacheKey.headerBehavior === "whitelist" &&
        namesHeader(this.cacheKey.headers, name)) ||
      policyForwardsHeader(
        this.forwarding.headerBehavior,
        this.forwarding.headers,
        name,
      )
    );
  }

  /**
   * Whether the cache policy keyed on compression, which is either of its two
   * `EnableAcceptEncoding` flags.
   *
   * A policy that did decides the `Accept-Encoding` the Origin is asked for on
   * its own. AWS says as much: a policy naming the header alongside these
   * flags has no effect on the Origin request.
   */
  get keysOnCompression(): boolean {
    return (
      this.cacheKey.enableAcceptEncodingGzip ||
      this.cacheKey.enableAcceptEncodingBrotli
    );
  }

  /**
   * The `Accept-Encoding` CloudFront sends where the cache policy keyed on
   * compression, or none where it did not.
   *
   * CloudFront normalizes this header rather than passing the viewer's own on.
   * An encoding the viewer asked for and the policy left out is left out of
   * what the Origin is asked for. A policy naming the header outright carries
   * the viewer's value, and never reaches this.
   */
  normalizedAcceptEncoding(headers: Headers): string | undefined {
    const encodings = simCfNormalizedAcceptEncoding(headers, this.cacheKey);
    // AWS writes the normalized header with gzip first.
    const ordered = ["gzip", "br"].filter((encoding) =>
      encodings.includes(encoding),
    );

    return ordered.length === 0 ? undefined : ordered.join(", ");
  }

  /**
   * Whether one of the viewer's cookies travels to the Origin. CloudFront
   * reads a cookie name case sensitively.
   */
  forwardsCookie(name: string): boolean {
    return (
      behaviorNames(
        this.cacheKey.cookieBehavior,
        this.cacheKey.cookies,
        name,
      ) ||
      behaviorNames(
        this.forwarding.cookieBehavior,
        this.forwarding.cookies,
        name,
      )
    );
  }

  /**
   * Whether one of the viewer's query strings travels to the Origin.
   * CloudFront reads a query string name case sensitively.
   */
  forwardsQueryString(name: string): boolean {
    return (
      behaviorNames(
        this.cacheKey.queryStringBehavior,
        this.cacheKey.queryStrings,
        name,
      ) ||
      behaviorNames(
        this.forwarding.queryStringBehavior,
        this.forwarding.queryStrings,
        name,
      )
    );
  }
}

/**
 * Whether a header behaviour carries one header name.
 *
 * `allViewerAndWhitelistCloudFront` carries every viewer header, and its list
 * names CloudFront's own headers rather than the viewer's. Nothing here
 * generates those, so the list adds nothing to what `allViewer` already
 * carries.
 */
function policyForwardsHeader(
  behavior: SimCfForwardedHeaderBehavior,
  headers: readonly string[],
  name: string,
): boolean {
  switch (behavior) {
    case "allViewer":
    case "allViewerAndWhitelistCloudFront": {
      return true;
    }
    case "whitelist": {
      return namesHeader(headers, name);
    }
    case "allExcept": {
      return !namesHeader(headers, name);
    }
    case "none": {
      return false;
    }
  }
}

/**
 * Whether a cookie or query string behaviour carries one name.
 *
 * The cookie behaviours and the query string behaviours are the same four
 * values in both kinds of policy, so one function reads all of them.
 */
function behaviorNames(
  behavior: SimCfForwardedCookieBehavior,
  listed: readonly string[],
  name: string,
): boolean {
  switch (behavior) {
    case "all": {
      return true;
    }
    case "whitelist": {
      return listed.includes(name);
    }
    case "allExcept": {
      return !listed.includes(name);
    }
    case "none": {
      return false;
    }
  }
}

/**
 * Whether a list of header names holds one, whatever case either was written
 * in.
 */
function namesHeader(headers: readonly string[], name: string): boolean {
  return headers.some((header) => header.toLowerCase() === name.toLowerCase());
}
