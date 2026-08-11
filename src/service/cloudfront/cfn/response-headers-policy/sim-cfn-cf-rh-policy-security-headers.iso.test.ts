import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimCloudFrontResponseHeader } from "../../response-headers-policy/sim-cf-response-header.js";
import { simCfnCfResponseHeadersPolicySecurityHeaders } from "./sim-cfn-cf-rh-policy-security-headers.js";

describe("simCfnCfResponseHeadersPolicySecurityHeaders", () => {
  function refuse(detail: string): never {
    throw new Error(
      `Invalid AWS::CloudFront::ResponseHeadersPolicy CacheHeaders: ${detail}`,
    );
  }

  function headersFrom(
    section: Record<string, unknown>,
  ): SimCloudFrontResponseHeader[] {
    return simCfnCfResponseHeadersPolicySecurityHeaders(
      { SecurityHeadersConfig: section },
      refuse,
    );
  }

  it("reads each section into its header", () => {
    // Given the config CDK's securityHeadersBehavior synthesizes.
    const headers = headersFrom({
      ContentSecurityPolicy: {
        ContentSecurityPolicy: "default-src 'self'",
        Override: true,
      },
      ContentTypeOptions: { Override: true },
      FrameOptions: { FrameOption: "DENY", Override: false },
      ReferrerPolicy: { ReferrerPolicy: "same-origin", Override: true },
      StrictTransportSecurity: {
        AccessControlMaxAgeSec: 31_536_000,
        IncludeSubdomains: true,
        Preload: true,
        Override: true,
      },
      XSSProtection: { Protection: true, ModeBlock: true, Override: true },
    });

    // Then each section becomes the header CloudFront documents for it.
    assertArrayLength(headers, 6);

    function headerValue(name: string): string | undefined {
      return headers.find((header) => header.name === name)?.value;
    }

    assertIdentical(
      headerValue("Content-Security-Policy"),
      "default-src 'self'",
    );
    assertIdentical(headerValue("X-Content-Type-Options"), "nosniff");
    assertIdentical(headerValue("X-Frame-Options"), "DENY");
    assertIdentical(headerValue("Referrer-Policy"), "same-origin");
    assertIdentical(
      headerValue("Strict-Transport-Security"),
      "max-age=31536000; includeSubDomains; preload",
    );
    assertIdentical(headerValue("X-XSS-Protection"), "1; mode=block");
  });

  it("reads a minimal StrictTransportSecurity and XSSProtection", () => {
    // Given the optional directives left out.
    const headers = headersFrom({
      StrictTransportSecurity: { AccessControlMaxAgeSec: 600, Override: true },
      XSSProtection: { Protection: false, Override: true },
    });

    // Then only the required directive is present, and Protection false gives
    // the header CloudFront sends to turn XSS auditing off.
    const strictTransportSecurity = headers.find(
      (header) => header.name === "Strict-Transport-Security",
    );
    const xssProtection = headers.find(
      (header) => header.name === "X-XSS-Protection",
    );

    assertNonNullable(strictTransportSecurity);
    assertNonNullable(xssProtection);
    assertIdentical(strictTransportSecurity.value, "max-age=600");
    assertIdentical(xssProtection.value, "0");
  });

  it("reads an XSSProtection reporting URI", () => {
    // Given a policy reporting rather than blocking.
    const headers = headersFrom({
      XSSProtection: {
        Protection: true,
        ReportUri: "https://example.com/report",
        Override: true,
      },
    });

    assertIdentical(headers[0]?.value, "1; report=https://example.com/report");
  });

  it("reads a section with no sub-sections as setting nothing", () => {
    assertArrayLength(headersFrom({}), 0);
  });

  it("sets nothing when the section is absent", () => {
    assertArrayLength(
      simCfnCfResponseHeadersPolicySecurityHeaders({}, refuse),
      0,
    );
  });

  it("names the Resource and the field missing from a sub-section", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        headersFrom({ ContentSecurityPolicy: { Override: true } }),
      ).message,
      "CacheHeaders",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        headersFrom({ ContentSecurityPolicy: { Override: true } }),
      ).message,
      "needs a string ContentSecurityPolicy",
    );
    assertStringIncludes(
      assertThrowsError(() => headersFrom({ FrameOptions: { Override: true } }))
        .message,
      "needs a string FrameOption",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        headersFrom({ StrictTransportSecurity: { Override: true } }),
      ).message,
      "needs a whole number AccessControlMaxAgeSec",
    );
    assertStringIncludes(
      assertThrowsError(() => headersFrom({ ContentTypeOptions: {} })).message,
      "needs a boolean Override",
    );
  });

  it("refuses a sub-section that is not an object", () => {
    assertStringIncludes(
      assertThrowsError(() => headersFrom({ FrameOptions: "nope" })).message,
      "SecurityHeadersConfig FrameOptions must be an object",
    );
  });

  it("refuses a FrameOption or ReferrerPolicy CloudFront does not accept", () => {
    // Given directives outside the sets CloudFront documents.
    assertStringIncludes(
      assertThrowsError(() =>
        headersFrom({ FrameOptions: { FrameOption: "ALLOW", Override: true } }),
      ).message,
      "FrameOption must be one of DENY, SAMEORIGIN",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        headersFrom({
          ReferrerPolicy: { ReferrerPolicy: "sometimes", Override: true },
        }),
      ).message,
      "ReferrerPolicy must be one of no-referrer",
    );
  });

  it("refuses ModeBlock and ReportUri together", () => {
    // CloudFront takes the block directive or a reporting URI, not both.
    assertStringIncludes(
      assertThrowsError(() =>
        headersFrom({
          XSSProtection: {
            Protection: true,
            ModeBlock: true,
            ReportUri: "https://example.com/report",
            Override: true,
          },
        }),
      ).message,
      "cannot set both ModeBlock and ReportUri",
    );
  });

  it("refuses a ReportUri that is not a string", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        headersFrom({
          XSSProtection: { Protection: true, ReportUri: 7, Override: true },
        }),
      ).message,
      "ReportUri must be a string",
    );
  });

  it("refuses an AccessControlMaxAgeSec that is not a whole number", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        headersFrom({
          StrictTransportSecurity: {
            AccessControlMaxAgeSec: 1.5,
            Override: true,
          },
        }),
      ).message,
      "needs a whole number AccessControlMaxAgeSec",
    );
  });

  it("refuses a section that is not an object", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        simCfnCfResponseHeadersPolicySecurityHeaders(
          { SecurityHeadersConfig: "nope" },
          refuse,
        ),
      ).message,
      "SecurityHeadersConfig must be an object",
    );
  });
});
