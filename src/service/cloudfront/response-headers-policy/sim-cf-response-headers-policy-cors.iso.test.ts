import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontResponseHeadersPolicyCors } from "./sim-cf-response-headers-policy-cors.js";

describe("SimCloudFrontResponseHeadersPolicyCors", () => {
  function cors(
    properties: Partial<{
      allowCredentials: boolean;
      allowHeaders: readonly string[];
      allowMethods: readonly string[];
      allowOrigins: readonly string[];
      exposeHeaders: readonly string[];
      maxAgeSec: number;
      originOverride: boolean;
    }> = {},
  ): SimCloudFrontResponseHeadersPolicyCors {
    return new SimCloudFrontResponseHeadersPolicyCors({
      allowCredentials: false,
      allowHeaders: [],
      allowMethods: ["GET"],
      allowOrigins: ["https://example.com"],
      originOverride: true,
      ...properties,
    });
  }

  it("reflects an Origin the allow list names", () => {
    // Given a policy allowing one Origin.
    const headers = new Headers();

    // When a request names it.
    cors().apply(headers, "https://example.com");

    // Then it is reflected back, with Vary telling a cache the response
    // depends on it.
    assertIdentical(
      headers.get("access-control-allow-origin"),
      "https://example.com",
    );
    assertIdentical(headers.get("vary"), "Origin");
  });

  it("sends a literal wildcard for an allow list of *", () => {
    // Given a policy allowing every Origin.
    const headers = new Headers();

    // When any Origin, or none, requests it.
    cors({ allowOrigins: ["*"] }).apply(headers, "https://anything.example");

    // Then the header is the wildcard itself, and there is nothing to vary
    // the cache on since every Origin gets the same response.
    assertIdentical(headers.get("access-control-allow-origin"), "*");
    assertIdentical(headers.get("vary"), null);
  });

  it("adds none of its headers for an Origin the allow list does not name", () => {
    // Given a policy allowing one Origin.
    const headers = new Headers();

    // When a different Origin requests it.
    cors().apply(headers, "https://evil.example");

    // Then nothing is added, as CloudFront sends none rather than a
    // mismatched one.
    assertIdentical(headers.get("access-control-allow-origin"), null);
    assertIdentical(headers.get("access-control-allow-methods"), null);
  });

  it("adds none of its headers for a request naming no Origin", () => {
    // Given a policy allowing one Origin.
    const headers = new Headers();

    // When a request carries no Origin header at all.
    cors().apply(headers, null);

    // Then nothing is added.
    assertIdentical(headers.get("access-control-allow-origin"), null);
  });

  it("expands ALL to CloudFront's full method list", () => {
    // Given a policy allowing every method.
    const headers = new Headers();

    cors({ allowMethods: ["ALL"] }).apply(headers, "https://example.com");

    // Then the header names every method CloudFront documents for ALL.
    assertIdentical(
      headers.get("access-control-allow-methods"),
      "GET,DELETE,HEAD,OPTIONS,PATCH,POST,PUT",
    );
  });

  it("omits Access-Control-Allow-Credentials when credentials are not allowed", () => {
    // Given a policy that does not allow credentials.
    const headers = new Headers();

    cors({ allowCredentials: false }).apply(headers, "https://example.com");

    // Then the header is left off entirely, since fetch treats it the same
    // as a header naming "false" would be, and CloudFront sends neither.
    assertIdentical(headers.get("access-control-allow-credentials"), null);
  });

  it("sends Access-Control-Allow-Credentials true when credentials are allowed", () => {
    const headers = new Headers();

    cors({ allowCredentials: true }).apply(headers, "https://example.com");

    assertIdentical(headers.get("access-control-allow-credentials"), "true");
  });

  it("omits Access-Control-Expose-Headers and -Max-Age when unset", () => {
    // Given a policy naming neither.
    const headers = new Headers();

    cors().apply(headers, "https://example.com");

    // Then neither header is added.
    assertIdentical(headers.get("access-control-expose-headers"), null);
    assertIdentical(headers.get("access-control-max-age"), null);
  });

  it("adds nothing at all when the Origin sent any CORS header and it does not override", () => {
    // Given a policy without OriginOverride, and an Origin response carrying
    // one CORS header.
    const headers = new Headers({
      "Access-Control-Allow-Methods": "GET,POST,PUT",
    });

    cors({ originOverride: false, allowMethods: ["GET"] }).apply(
      headers,
      "https://example.com",
    );

    // Then the Origin's value stands and none of the section's other headers
    // are added either: CloudFront treats OriginOverride as a decision about
    // the whole CORS section rather than one header at a time.
    assertIdentical(
      headers.get("access-control-allow-methods"),
      "GET,POST,PUT",
    );
    assertIdentical(headers.get("access-control-allow-origin"), null);
    assertIdentical(headers.get("access-control-allow-headers"), null);
  });

  it("keeps the whole section off for a CORS header the policy does not name", () => {
    // Given a policy that sets no Max-Age, and an Origin response carrying one.
    const headers = new Headers({ "Access-Control-Max-Age": "60" });

    cors({ originOverride: false }).apply(headers, "https://example.com");

    // Then the section still stands down, because CloudFront looks for any
    // CORS header from the Origin rather than only the ones in the policy.
    assertIdentical(headers.get("access-control-allow-origin"), null);
  });

  it("applies without override when the Origin sent no CORS header", () => {
    // Given the same policy and a response carrying none.
    const headers = new Headers({ "content-type": "text/html" });

    cors({ originOverride: false }).apply(headers, "https://example.com");

    // Then the policy's headers are added, as CloudFront adds them whenever
    // the Origin left the header out.
    assertIdentical(
      headers.get("access-control-allow-origin"),
      "https://example.com",
    );
  });

  it("reflects an Origin matching a wildcard subdomain entry", () => {
    // Given an allow list naming a wildcard subdomain.
    const headers = new Headers();

    cors({ allowOrigins: ["https://*.example.com"] }).apply(
      headers,
      "https://app.example.com",
    );

    // Then the request's own Origin is reflected, not the pattern.
    assertIdentical(
      headers.get("access-control-allow-origin"),
      "https://app.example.com",
    );
    assertIdentical(headers.get("vary"), "Origin");
  });
});
