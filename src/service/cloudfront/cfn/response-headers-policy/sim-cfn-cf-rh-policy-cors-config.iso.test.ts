import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimCloudFrontResponseHeadersPolicyCors } from "../../response-headers-policy/sim-cf-response-headers-policy-cors.js";
import { simCfnCfResponseHeadersPolicyCors } from "./sim-cfn-cf-rh-policy-cors-config.js";

describe("simCfnCfResponseHeadersPolicyCors", () => {
  function refuse(detail: string): never {
    throw new Error(
      `Invalid AWS::CloudFront::ResponseHeadersPolicy CacheHeaders: ${detail}`,
    );
  }

  function corsFrom(
    section: Record<string, unknown>,
  ): SimCloudFrontResponseHeadersPolicyCors {
    const cors = simCfnCfResponseHeadersPolicyCors(
      { CorsConfig: section },
      refuse,
    );

    assertNonNullable(cors);

    return cors;
  }

  it("reads no CORS from an absent section", () => {
    assertUndefined(simCfnCfResponseHeadersPolicyCors({}, refuse));
  });

  it("reads the config CDK's corsBehavior synthesizes", () => {
    // Given the config CDK synthesizes for a CORS policy.
    const cors = corsFrom({
      AccessControlAllowCredentials: true,
      AccessControlAllowHeaders: { Items: ["*"] },
      AccessControlAllowMethods: { Items: ["GET", "POST"] },
      AccessControlAllowOrigins: { Items: ["https://example.com"] },
      AccessControlExposeHeaders: { Items: ["X-Custom"] },
      AccessControlMaxAgeSec: 600,
      OriginOverride: true,
    });

    // Then applying it for the allowed Origin sets every header the section
    // names.
    const headers = new Headers();
    cors.apply(headers, "https://example.com");

    assertIdentical(
      headers.get("access-control-allow-origin"),
      "https://example.com",
    );
    assertIdentical(headers.get("access-control-allow-methods"), "GET,POST");
    assertIdentical(headers.get("access-control-allow-headers"), "*");
    assertIdentical(headers.get("access-control-allow-credentials"), "true");
    assertIdentical(headers.get("access-control-expose-headers"), "X-Custom");
    assertIdentical(headers.get("access-control-max-age"), "600");
  });

  it("reads a config naming no AccessControlExposeHeaders or AccessControlMaxAgeSec", () => {
    // Given the two optional fields left out.
    const cors = corsFrom({
      AccessControlAllowCredentials: false,
      AccessControlAllowHeaders: { Items: [] },
      AccessControlAllowMethods: { Items: ["GET"] },
      AccessControlAllowOrigins: { Items: ["*"] },
      OriginOverride: true,
    });

    // Then applying it sets neither header.
    const headers = new Headers();
    cors.apply(headers, "https://example.com");

    assertIdentical(headers.get("access-control-expose-headers"), null);
    assertIdentical(headers.get("access-control-max-age"), null);
  });

  it("refuses a config missing a required boolean field", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        corsFrom({
          AccessControlAllowHeaders: { Items: [] },
          AccessControlAllowMethods: { Items: [] },
          AccessControlAllowOrigins: { Items: [] },
          OriginOverride: true,
        }),
      ).message,
      "CorsConfig needs a boolean AccessControlAllowCredentials",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        corsFrom({
          AccessControlAllowCredentials: true,
          AccessControlAllowHeaders: { Items: [] },
          AccessControlAllowMethods: { Items: [] },
          AccessControlAllowOrigins: { Items: [] },
        }),
      ).message,
      "CorsConfig needs a boolean OriginOverride",
    );
  });

  it("names the Resource in the refusal", () => {
    assertStringIncludes(
      assertThrowsError(() => corsFrom({})).message,
      "CacheHeaders",
    );
  });

  it("refuses a field of the wrong shape", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        corsFrom({
          AccessControlAllowCredentials: true,
          AccessControlAllowHeaders: { Items: [] },
          AccessControlAllowMethods: { Items: [] },
          AccessControlAllowOrigins: { Items: [] },
          AccessControlMaxAgeSec: "not-a-number",
          OriginOverride: true,
        }),
      ).message,
      "needs a whole number AccessControlMaxAgeSec",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        corsFrom({
          AccessControlAllowCredentials: true,
          AccessControlAllowHeaders: { Items: [] },
          AccessControlAllowMethods: { Items: [] },
          AccessControlAllowOrigins: "nope",
          OriginOverride: true,
        }),
      ).message,
      "AccessControlAllowOrigins must be an object",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        corsFrom({
          AccessControlAllowCredentials: true,
          AccessControlAllowHeaders: { Items: [] },
          AccessControlAllowMethods: { Items: [] },
          AccessControlAllowOrigins: {},
          OriginOverride: true,
        }),
      ).message,
      "AccessControlAllowOrigins needs an array Items",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        corsFrom({
          AccessControlAllowCredentials: true,
          AccessControlAllowHeaders: { Items: [] },
          AccessControlAllowMethods: { Items: [] },
          AccessControlAllowOrigins: { Items: [1] },
          OriginOverride: true,
        }),
      ).message,
      "AccessControlAllowOrigins Items must be strings",
    );
  });

  it("refuses a config missing a required list field", () => {
    // Given configs each leaving out one list CloudFront requires. All three
    // are required by the CloudFront API, so a template omitting one would
    // deploy here but be refused by AWS.
    const withoutHeaders = {
      AccessControlAllowCredentials: true,
      AccessControlAllowMethods: { Items: [] },
      AccessControlAllowOrigins: { Items: [] },
      OriginOverride: true,
    };
    const withoutMethods = {
      AccessControlAllowCredentials: true,
      AccessControlAllowHeaders: { Items: [] },
      AccessControlAllowOrigins: { Items: [] },
      OriginOverride: true,
    };
    const withoutOrigins = {
      AccessControlAllowCredentials: true,
      AccessControlAllowHeaders: { Items: [] },
      AccessControlAllowMethods: { Items: [] },
      OriginOverride: true,
    };

    assertStringIncludes(
      assertThrowsError(() => corsFrom(withoutHeaders)).message,
      "CorsConfig needs an AccessControlAllowHeaders",
    );
    assertStringIncludes(
      assertThrowsError(() => corsFrom(withoutMethods)).message,
      "CorsConfig needs an AccessControlAllowMethods",
    );
    assertStringIncludes(
      assertThrowsError(() => corsFrom(withoutOrigins)).message,
      "CorsConfig needs an AccessControlAllowOrigins",
    );
  });

  it("keeps AccessControlExposeHeaders optional", () => {
    // Given a config leaving out the one list CloudFront does not require.
    const cors = corsFrom({
      AccessControlAllowCredentials: true,
      AccessControlAllowHeaders: { Items: [] },
      AccessControlAllowMethods: { Items: [] },
      AccessControlAllowOrigins: { Items: ["*"] },
      OriginOverride: true,
    });

    // Then it is read rather than refused.
    const headers = new Headers();
    cors.apply(headers, null);

    assertIdentical(headers.get("access-control-expose-headers"), null);
  });

  it("refuses a wildcard where CloudFront does not allow one", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        corsFrom({
          AccessControlAllowCredentials: true,
          AccessControlAllowHeaders: { Items: [] },
          AccessControlAllowMethods: { Items: [] },
          AccessControlAllowOrigins: { Items: ["test.*.example.org"] },
          OriginOverride: true,
        }),
      ).message,
      "leftmost subdomain",
    );
  });

  it("refuses an AccessControlMaxAgeSec that is not a whole number", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        corsFrom({
          AccessControlAllowCredentials: true,
          AccessControlAllowHeaders: { Items: [] },
          AccessControlAllowMethods: { Items: [] },
          AccessControlAllowOrigins: { Items: ["*"] },
          AccessControlMaxAgeSec: 1.5,
          OriginOverride: true,
        }),
      ).message,
      "needs a whole number AccessControlMaxAgeSec",
    );
  });

  it("refuses a section that is not an object", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        simCfnCfResponseHeadersPolicyCors({ CorsConfig: "nope" }, refuse),
      ).message,
      "CorsConfig must be an object",
    );
  });
});
