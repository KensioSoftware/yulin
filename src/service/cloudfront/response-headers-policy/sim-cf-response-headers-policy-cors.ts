import { simCfCorsOriginPatternMatches } from "./sim-cf-cors-origin-pattern.js";

const allAccessControlMethods = [
  "GET",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
] as const;

/**
 * The response headers a CORS section decides, whether or not it sets each.
 *
 * Without `OriginOverride`, an Origin response carrying any one of these keeps
 * the whole section off, so the set matters rather than just the ones the
 * policy would have added.
 */
const corsResponseHeaders = [
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Credentials",
  "Access-Control-Expose-Headers",
  "Access-Control-Max-Age",
] as const;

interface SimCloudFrontResponseHeadersPolicyCorsProperties {
  readonly allowCredentials: boolean;
  readonly allowHeaders: readonly string[];
  readonly allowMethods: readonly string[];
  readonly allowOrigins: readonly string[];
  readonly exposeHeaders?: readonly string[];
  readonly maxAgeSec?: number;
  readonly originOverride: boolean;
}

/**
 * The CORS section of a response headers policy.
 *
 * CloudFront reflects the viewer request's `Origin` header against the
 * configured allow list rather than sending the list itself, so the headers
 * this adds depend on the request they answer: a request naming an Origin
 * the list does not allow gets none of them, the same as CloudFront sending
 * none rather than a mismatched one.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html#understanding-response-headers-policies-cors
 */
export class SimCloudFrontResponseHeadersPolicyCors {
  private readonly allowCredentials: boolean;
  private readonly allowHeaders: readonly string[];
  private readonly allowMethods: readonly string[];
  private readonly allowOrigins: readonly string[];
  private readonly exposeHeaders: readonly string[];
  private readonly maxAgeSec: number | undefined;
  private readonly originOverride: boolean;

  constructor(properties: SimCloudFrontResponseHeadersPolicyCorsProperties) {
    this.allowCredentials = properties.allowCredentials;
    this.allowHeaders = properties.allowHeaders;
    this.allowMethods = properties.allowMethods;
    this.allowOrigins = properties.allowOrigins;
    this.exposeHeaders = properties.exposeHeaders ?? [];
    this.maxAgeSec = properties.maxAgeSec;
    this.originOverride = properties.originOverride;
  }

  /**
   * Set this policy's CORS headers on a response, for the `Origin` header a
   * viewer request carried.
   *
   * `OriginOverride` decides the whole section rather than one header at a
   * time, unlike a custom or security header: without it, an Origin response
   * carrying any CORS header at all keeps every header this section would have
   * set off the response, whether or not the policy names that header.
   */
  apply(headers: Headers, requestOrigin: string | null): void {
    if (
      !this.originOverride &&
      corsResponseHeaders.some((n) => headers.has(n))
    ) {
      return;
    }

    const allowOrigin = this.resolveAllowOrigin(requestOrigin);

    if (allowOrigin === undefined) {
      return;
    }

    headers.set("Access-Control-Allow-Origin", allowOrigin);

    // CloudFront varies the cache on Origin whenever the header it sent back
    // was chosen for this request rather than good for every request, so a
    // cached response for one Origin is never served to a different one.
    if (allowOrigin !== "*") {
      headers.append("Vary", "Origin");
    }

    // An empty list names no method and no header. CloudFront leaves the
    // header off there, the way it leaves off the expose list below, and a
    // header carrying an empty value would mean something else to a browser.
    if (this.allowMethods.length > 0) {
      headers.set(
        "Access-Control-Allow-Methods",
        this.resolvedAllowMethods().join(","),
      );
    }

    if (this.allowHeaders.length > 0) {
      headers.set("Access-Control-Allow-Headers", this.allowHeaders.join(","));
    }

    // A false Access-Control-Allow-Credentials is not a header value the
    // fetch spec recognises, so CloudFront leaves it off rather than sending
    // a value meaning the same as absence.
    if (this.allowCredentials) {
      headers.set("Access-Control-Allow-Credentials", "true");
    }

    if (this.exposeHeaders.length > 0) {
      headers.set(
        "Access-Control-Expose-Headers",
        this.exposeHeaders.join(","),
      );
    }

    if (this.maxAgeSec !== undefined) {
      headers.set("Access-Control-Max-Age", String(this.maxAgeSec));
    }
  }

  private resolveAllowOrigin(requestOrigin: string | null): string | undefined {
    if (this.allowOrigins.includes("*")) {
      return "*";
    }

    if (requestOrigin === null) {
      return undefined;
    }

    return this.allowOrigins.some((pattern) =>
      simCfCorsOriginPatternMatches(pattern, requestOrigin),
    )
      ? requestOrigin
      : undefined;
  }

  private resolvedAllowMethods(): readonly string[] {
    return this.allowMethods.includes("ALL")
      ? allAccessControlMethods
      : this.allowMethods;
  }
}
