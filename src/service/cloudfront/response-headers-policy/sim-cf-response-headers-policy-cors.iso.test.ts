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

  it("keeps an Origin header it does not override", () => {
    // Given a policy without OriginOverride, and a response that already
    // carries the header CloudFront would otherwise set.
    const headers = new Headers({
      "Access-Control-Allow-Methods": "GET,POST,PUT",
    });

    cors({ originOverride: false, allowMethods: ["GET"] }).apply(
      headers,
      "https://example.com",
    );

    // Then the Origin's value stands.
    assertIdentical(
      headers.get("access-control-allow-methods"),
      "GET,POST,PUT",
    );
  });
});
