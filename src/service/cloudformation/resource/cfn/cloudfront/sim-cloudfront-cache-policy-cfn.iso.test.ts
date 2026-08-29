import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontCachePolicy } from "../../../../cloudfront/cache-policy/sim-cf-cache-policy.js";
import { SimCloudFrontCachePolicyCfn } from "./sim-cloudfront-cache-policy-cfn.js";
import { cloudFrontValueAdapter } from "./sim-cloudfront-cfn-value-adapter.js";

describe("SimCloudFrontCachePolicyCfn", () => {
  const policy = new SimCloudFrontCachePolicy({ name: "BeaconPolicy" });
  const adapter = new SimCloudFrontCachePolicyCfn({ policy });

  it("answers a Ref with the policy ID", () => {
    // Given a created policy.
    // When a template Refs it, then it gets the ID a Cache Behavior's
    // CachePolicyId wants.
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
      logicalId: "BeaconPolicy",
      type: "AWS::CloudFront::CachePolicy",
      simResource: policy,
    });

    // Then the policy's own adapter answers.
    assertInstanceOf(resolved, SimCloudFrontCachePolicyCfn);
  });
});
