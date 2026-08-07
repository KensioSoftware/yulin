import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
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
    assertArrayLength(policy.customHeaders, 0);
    assertArrayLength(policy.headersToRemove, 0);
  });

  it("reads a section with no items", () => {
    // Given a policy config whose sections are present but empty.
    const policy = policyFrom({
      CustomHeadersConfig: {},
      RemoveHeadersConfig: {},
    });

    // Then it has no headers either way.
    assertArrayLength(policy.customHeaders, 0);
    assertArrayLength(policy.headersToRemove, 0);
  });

  it("refuses each section it does not model, by name", () => {
    // Given policy configs using the sections this simulation does not model.
    // When each is read, then it is refused by name rather than stepped over,
    // because a policy that quietly sets fewer headers here than in AWS is a
    // divergence a test would not catch.
    for (const section of [
      "CorsConfig",
      "SecurityHeadersConfig",
      "ServerTimingHeadersConfig",
    ]) {
      const error = assertThrowsError(() => policyFrom({ [section]: {} }));

      assertStringIncludes(error.message, section);
      assertStringIncludes(error.message, "CacheHeaders");
    }
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

    assertStringIncludes(error.message, "Name must be a string");
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
