import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontOriginRequestPolicy } from "../../../../cloudfront/origin-request-policy/sim-cf-origin-request-policy.js";
import { SimCloudFrontOriginRequestPolicyCfn } from "./sim-cloudfront-orp-cfn.js";
import { cloudFrontValueAdapter } from "./sim-cloudfront-cfn-value-adapter.js";

describe("SimCloudFrontOriginRequestPolicyCfn", () => {
  const policy = new SimCloudFrontOriginRequestPolicy({ name: "BeaconPolicy" });
  const adapter = new SimCloudFrontOriginRequestPolicyCfn({ policy });

  it("answers a Ref with the policy ID", () => {
    // Given a created policy.
    // When a template Refs it, then it gets the ID a Cache Behavior's
    // OriginRequestPolicyId wants.
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
      type: "AWS::CloudFront::OriginRequestPolicy",
      simResource: policy,
    });

    // Then the policy's own adapter answers.
    assertInstanceOf(resolved, SimCloudFrontOriginRequestPolicyCfn);
  });
});
