import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFrontResponseHeadersPolicy } from "../../response-headers-policy/sim-cf-response-headers-policy.js";
import { SimCfnCfResponseHeadersPolicyConfig } from "./sim-cfn-cf-rh-policy-config.js";

describe("SimCfnCfResponseHeadersPolicyConfig", () => {
  const resource = new SimCfnResource({ logicalId: "CacheHeaders" });

  function policyFrom(
    config: SimCfnTemplateValueRecord,
  ): SimCloudFrontResponseHeadersPolicy {
    return new SimCfnCfResponseHeadersPolicyConfig({
      resource,
      properties: {
        ResponseHeadersPolicyConfig: { Name: "CacheHeaders", ...config },
      },
    }).build();
  }

  it("reads the custom headers a policy sets", () => {
    // Given the config CDK synthesizes for a policy adding one header.
    const policy = policyFrom({
      CustomHeadersConfig: {
        Items: [
          {
            Header: "Cache-Control",
            Override: true,
            Value: "public, max-age=0",
          },
        ],
      },
    });

    // Then the header, its value and its Override are read.
    assertIdentical(policy.name, "CacheHeaders");
    assertArrayLength(policy.customHeaders, 1);

    const [header] = policy.customHeaders;

    assertNonNullable(header);
    assertIdentical(header.name, "Cache-Control");
    assertIdentical(header.value, "public, max-age=0");
    assertTrue(header.override);
  });

  it("reads the headers a policy removes", () => {
    // Given a policy config removing a header.
    const policy = policyFrom({
      RemoveHeadersConfig: { Items: [{ Header: "Server" }] },
    });

    // Then the name is read.
    assertArrayLength(policy.headersToRemove, 1);
    assertIdentical(policy.headersToRemove[0], "Server");
  });

  it("reads a policy that sets and removes nothing", () => {
    // Given a policy config with neither section.
    const policy = policyFrom({});

    // Then it has no headers either way, rather than failing to build.
    assertArrayEmpty(policy.customHeaders);
    assertArrayEmpty(policy.headersToRemove);
  });

  it("reads a section with no items", () => {
    // Given a policy config whose sections are present but empty.
    const policy = policyFrom({
      CustomHeadersConfig: {},
      RemoveHeadersConfig: {},
    });

    // Then it has no headers either way.
    assertArrayEmpty(policy.customHeaders);
    assertArrayEmpty(policy.headersToRemove);
  });

  it("reads the security headers a policy sets", () => {
    // Given the config CDK's securityHeadersBehavior synthesizes, which the
    // per-section mapping is tested by SimCfnCfResponseHeadersPolicySecurityHeaders.
    const policy = policyFrom({
      SecurityHeadersConfig: {
        ContentTypeOptions: { Override: true },
      },
    });

    // Then the section is delegated to and its header is on the policy.
    assertArrayLength(policy.securityHeaders, 1);
    assertIdentical(policy.securityHeaders[0].name, "X-Content-Type-Options");
  });

  it("reads a policy setting no security headers", () => {
    // Given a SecurityHeadersConfig with no sections.
    const policy = policyFrom({ SecurityHeadersConfig: {} });

    // Then it sets none.
    assertArrayEmpty(policy.securityHeaders);
  });

  it("reads ServerTimingHeadersConfig once enabled", () => {
    // Given the config enabling the Server-Timing header.
    const policy = policyFrom({
      ServerTimingHeadersConfig: { Enabled: true, SamplingRate: 50 },
    });

    // Then the header is set.
    assertNonNullable(policy.serverTiming);
    assertIdentical(policy.serverTiming.name, "Server-Timing");
  });

  it("reads a disabled ServerTimingHeadersConfig as setting nothing", () => {
    // Given the config leaving the header off.
    const policy = policyFrom({
      ServerTimingHeadersConfig: { Enabled: false },
    });

    // Then no header is set.
    assertUndefined(policy.serverTiming);
  });

  it("refuses a ServerTimingHeadersConfig with no boolean Enabled", () => {
    assertStringIncludes(
      assertThrowsError(() => policyFrom({ ServerTimingHeadersConfig: {} }))
        .message,
      "needs a boolean Enabled",
    );
  });

  it("reads the CORS a policy sets", () => {
    // Given the config CDK's corsBehavior synthesizes, which the per-field
    // mapping is tested by SimCfnCfResponseHeadersPolicyCorsConfig.
    const policy = policyFrom({
      CorsConfig: {
        AccessControlAllowCredentials: true,
        AccessControlAllowHeaders: { Items: ["*"] },
        AccessControlAllowMethods: { Items: ["GET"] },
        AccessControlAllowOrigins: { Items: ["https://example.com"] },
        OriginOverride: true,
      },
    });

    // Then the section is delegated to and its model is on the policy.
    assertNonNullable(policy.cors);

    const headers = new Headers();
    policy.cors.apply(headers, "https://example.com");

    assertIdentical(
      headers.get("access-control-allow-origin"),
      "https://example.com",
    );
  });

  it("reads a policy with no CorsConfig as having none", () => {
    const policy = policyFrom({});

    assertUndefined(policy.cors);
  });

  it("refuses a policy config that is not an object", () => {
    // Given a Resource whose policy config did not resolve to an object.
    // When it is read, then it is refused.
    const error = assertThrowsError(() =>
      new SimCfnCfResponseHeadersPolicyConfig({
        resource,
        properties: { ResponseHeadersPolicyConfig: "nope" },
      }).build(),
    );

    assertStringIncludes(
      error.message,
      "ResponseHeadersPolicyConfig must be an object",
    );
  });

  it("refuses a policy with no name", () => {
    // Given a policy config missing its Name.
    // When it is read, then it is refused.
    const error = assertThrowsError(() =>
      new SimCfnCfResponseHeadersPolicyConfig({
        resource,
        properties: { ResponseHeadersPolicyConfig: {} },
      }).build(),
    );

    assertStringIncludes(
      error.message,
      "ResponseHeadersPolicyConfig needs a string Name",
    );
  });

  it("refuses a custom header missing its Header, Value or Override", () => {
    // Given policy configs whose header items are incomplete.
    // When each is read, then it is refused by what is missing.
    assertStringIncludes(
      assertThrowsError(() =>
        policyFrom({
          CustomHeadersConfig: { Items: [{ Override: true, Value: "x" }] },
        }),
      ).message,
      "need a string Header and Value",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        policyFrom({
          CustomHeadersConfig: { Items: [{ Header: "Vary", Value: "x" }] },
        }),
      ).message,
      "CustomHeadersConfig item Vary needs a boolean Override",
    );
  });

  it("refuses a custom header item that is not an object", () => {
    // Given a policy config whose header item is not an object.
    // When it is read, then it is refused.
    assertStringIncludes(
      assertThrowsError(() =>
        policyFrom({ CustomHeadersConfig: { Items: ["Vary"] } }),
      ).message,
      "CustomHeadersConfig items must be objects",
    );
  });

  it("refuses a removed header item without a name", () => {
    // Given a policy config whose removal item names nothing.
    // When it is read, then it is refused.
    assertStringIncludes(
      assertThrowsError(() =>
        policyFrom({ RemoveHeadersConfig: { Items: [{}] } }),
      ).message,
      "RemoveHeadersConfig items need a string Header",
    );
  });

  it("refuses a section or its items of the wrong shape", () => {
    // Given policy configs whose sections are not objects or whose items are
    // not arrays.
    // When each is read, then it is refused by name.
    assertStringIncludes(
      assertThrowsError(() => policyFrom({ CustomHeadersConfig: "nope" }))
        .message,
      "CustomHeadersConfig must be an object",
    );
    assertStringIncludes(
      assertThrowsError(() =>
        policyFrom({ RemoveHeadersConfig: { Items: "nope" } }),
      ).message,
      "RemoveHeadersConfig Items must be an array",
    );
  });
});
