const allAccessControlMethods = [
  "GET",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
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
   */
  apply(headers: Headers, requestOrigin: string | null): void {
    const allowOrigin = this.resolveAllowOrigin(requestOrigin);

    if (allowOrigin === undefined) {
      return;
    }

    this.set(headers, "Access-Control-Allow-Origin", allowOrigin);

    // CloudFront varies the cache on Origin whenever the header it sent back
    // was chosen for this request rather than good for every request, so a
    // cached response for one Origin is never served to a different one.
    if (allowOrigin !== "*") {
      headers.append("Vary", "Origin");
    }

    this.set(
      headers,
      "Access-Control-Allow-Methods",
      this.resolvedAllowMethods().join(","),
    );
    this.set(
      headers,
      "Access-Control-Allow-Headers",
      this.allowHeaders.join(","),
    );

    // A false Access-Control-Allow-Credentials is not a header value the
    // fetch spec recognises, so CloudFront leaves it off rather than sending
    // a value meaning the same as absence.
    if (this.allowCredentials) {
      this.set(headers, "Access-Control-Allow-Credentials", "true");
    }

    if (this.exposeHeaders.length > 0) {
      this.set(
        headers,
        "Access-Control-Expose-Headers",
        this.exposeHeaders.join(","),
      );
    }

    if (this.maxAgeSec !== undefined) {
      this.set(headers, "Access-Control-Max-Age", String(this.maxAgeSec));
    }
  }

  private resolveAllowOrigin(requestOrigin: string | null): string | undefined {
    if (this.allowOrigins.includes("*")) {
      return "*";
    }

    if (requestOrigin !== null && this.allowOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }

    return undefined;
  }

  private resolvedAllowMethods(): readonly string[] {
    return this.allowMethods.includes("ALL")
      ? allAccessControlMethods
      : this.allowMethods;
  }

  private set(headers: Headers, name: string, value: string): void {
    if (!this.originOverride && headers.has(name)) {
      return;
    }

    headers.set(name, value);
  }
}
