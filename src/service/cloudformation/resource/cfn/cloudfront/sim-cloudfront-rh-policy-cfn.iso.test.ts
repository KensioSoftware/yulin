import {
  assertIdentical,
  assertInstanceOf,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontResponseHeadersPolicy } from "../../../../cloudfront/response-headers-policy/sim-cf-response-headers-policy.js";
import { cloudFrontValueAdapter } from "./sim-cloudfront-cfn-value-adapter.js";
import { SimCloudFrontResponseHeadersPolicyCfn } from "./sim-cloudfront-rh-policy-cfn.js";

describe("SimCloudFrontResponseHeadersPolicyCfn", () => {
  const policy = new SimCloudFrontResponseHeadersPolicy({
    name: "CacheHeaders",
  });
  const adapter = new SimCloudFrontResponseHeadersPolicyCfn({ policy });

  it("answers a Ref with the policy ID", () => {
    // Given a created policy.
    // When a template Refs it, then it gets the ID a Cache Behavior's
    // ResponseHeadersPolicyId wants.
    assertIdentical(adapter.refValue(), policy.id);
  });

  it("answers the Id attribute with the policy ID", () => {
    // Given a created policy.
    // When a template reads its Id attribute, then it gets the same ID.
    assertIdentical(adapter.attributeValue("Id"), policy.id);
  });

  it("is the adapter the CloudFront registry picks for the Resource type", () => {
    // Given a created policy stored against its Resource type.
    // When the CloudFront value adapter registry is asked for one.
    const resolved = cloudFrontValueAdapter({
      logicalId: "CacheHeaders",
      type: "AWS::CloudFront::ResponseHeadersPolicy",
      simResource: policy,
    });

    // Then the policy's own adapter answers, rather than the default one.
    assertInstanceOf(resolved, SimCloudFrontResponseHeadersPolicyCfn);
  });

  it("leaves a Resource of another type to another service", () => {
    // Given a policy under a Resource type it does not belong to.
    // When the CloudFront registry is asked, then it claims nothing.
    assertUndefined(
      cloudFrontValueAdapter({
        logicalId: "SomethingElse",
        type: "AWS::SomeOther::Thing",
        simResource: policy,
      }),
    );
  });
});
