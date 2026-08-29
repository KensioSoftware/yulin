import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFrontOriginRequestPolicy } from "../../origin-request-policy/sim-cf-origin-request-policy.js";
import { SimCfnCfOriginRequestPolicyConfig } from "./sim-cfn-cf-orp-config.js";

describe("AWS::CloudFront::OriginRequestPolicy forwarding", () => {
  /**
   * The policy an `OriginRequestPolicyConfig` describes, under a Name of its
   * own so every case here is about the rest of the config.
   */
  function build(
    originRequestPolicyConfig: SimCfnTemplateValueRecord,
  ): SimCloudFrontOriginRequestPolicy {
    return new SimCfnCfOriginRequestPolicyConfig({
      resource: new SimCfnResource({ logicalId: "BeaconPolicy" }),
      properties: {
        OriginRequestPolicyConfig: {
          Name: "BeaconPolicy",
          ...originRequestPolicyConfig,
        },
      },
    }).build();
  }

  /**
   * The message refusing an `OriginRequestPolicyConfig` that could not be read.
   */
  function refusal(
    originRequestPolicyConfig: SimCfnTemplateValueRecord,
  ): string {
    return assertThrowsError(() => build(originRequestPolicyConfig)).message;
  }

  it("records the cookies, headers and query strings a template named", () => {
    // Given a policy forwarding one of each.
    const policy = build({
      CookiesConfig: { CookieBehavior: "whitelist", Cookies: ["session"] },
      HeadersConfig: { HeaderBehavior: "whitelist", Headers: ["Accept"] },
      QueryStringsConfig: {
        QueryStringBehavior: "allExcept",
        QueryStrings: ["utm_source"],
      },
    });

    // Then each section carries its behaviour and the names it applies to.
    assertIdentical(policy.forwarding.cookieBehavior, "whitelist");
    assertArrayEquals(policy.forwarding.cookies, ["session"]);
    assertIdentical(policy.forwarding.headerBehavior, "whitelist");
    assertArrayEquals(policy.forwarding.headers, ["Accept"]);
    assertIdentical(policy.forwarding.queryStringBehavior, "allExcept");
    assertArrayEquals(policy.forwarding.queryStrings, ["utm_source"]);
  });

  it("forwards nothing where the template named no section at all", () => {
    // Given a policy with a Name and a Comment and nothing else.
    const policy = build({ Comment: "Beacons" });

    // Then none of the viewer's request travels, which is CloudFront's `none`.
    assertIdentical(policy.forwarding.cookieBehavior, "none");
    assertIdentical(policy.forwarding.headerBehavior, "none");
    assertIdentical(policy.forwarding.queryStringBehavior, "none");
  });

  it("takes the header behaviours a cache key has no use for", () => {
    // Given a policy forwarding every header the viewer sent along with
    // CloudFront's own, which is no use as a cache key and is what
    // AllViewerAndCloudFrontHeaders-2022-06 does.
    const policy = build({
      HeadersConfig: {
        HeaderBehavior: "allViewerAndWhitelistCloudFront",
        Headers: ["CloudFront-Viewer-Country"],
      },
    });

    // Then the behaviour is read as written.
    assertIdentical(
      policy.forwarding.headerBehavior,
      "allViewerAndWhitelistCloudFront",
    );
    assertArrayEquals(policy.forwarding.headers, ["CloudFront-Viewer-Country"]);
  });

  it("refuses a header behaviour outside CloudFront's set", () => {
    // Given a policy naming a behaviour CloudFront does not offer a header
    // section, which `all` is even though a cookie section takes it.
    // When it is read, then the refusal names the Resource and the behaviour.
    const message = refusal({ HeadersConfig: { HeaderBehavior: "all" } });

    assertStringIncludes(message, "BeaconPolicy");
    assertStringIncludes(
      message,
      "HeadersConfig HeaderBehavior must be one of",
    );
    assertStringIncludes(message, "allViewerAndWhitelistCloudFront");
  });

  it("refuses a section that is not an object", () => {
    // Given a policy whose cookies section is a bare string.
    // When it is read, then the refusal says what the section should have been.
    const message = refusal({ CookiesConfig: "all" });

    assertStringIncludes(message, "BeaconPolicy");
    assertStringIncludes(message, "CookiesConfig must be an object");
  });

  it("refuses a list of names that is not a list of strings", () => {
    // Given a policy listing a query string name as a number.
    // When it is read, then the refusal names the field.
    const message = refusal({
      QueryStringsConfig: { QueryStringBehavior: "whitelist", QueryStrings: 1 },
    });

    assertStringIncludes(message, "BeaconPolicy");
    assertStringIncludes(
      message,
      "QueryStringsConfig QueryStrings must be a list of strings",
    );
  });
});
