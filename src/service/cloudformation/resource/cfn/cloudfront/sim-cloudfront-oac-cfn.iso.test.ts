import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCloudFrontOriginAccessControl } from "../../../../cloudfront/origin-access-control/sim-cf-origin-access-control.js";
import { cloudFrontValueAdapter } from "./sim-cloudfront-cfn-value-adapter.js";
import { SimCloudFrontOriginAccessControlCfn } from "./sim-cloudfront-oac-cfn.js";

describe("SimCloudFrontOriginAccessControlCfn", () => {
  const originAccessControl = new SimCloudFrontOriginAccessControl({
    name: "site-oac",
    signingBehavior: "always",
  });
  const adapter = new SimCloudFrontOriginAccessControlCfn({
    originAccessControl,
  });

  it("answers a Ref with the origin access control ID", () => {
    // Given a created origin access control.
    // When a template Refs it, then it gets the ID an Origin's
    // OriginAccessControlId wants.
    assertIdentical(adapter.refValue(), originAccessControl.id);
  });

  it("answers the Id attribute with the same ID", () => {
    // Given a created origin access control.
    // When a template reads its Id attribute, then it gets the same ID a Ref
    // gives, which is what CDK's L1 construct reads.
    assertIdentical(adapter.attributeValue("Id"), originAccessControl.id);
  });

  it("is the adapter the CloudFront registry picks for the Resource type", () => {
    // Given a created origin access control stored against its Resource type.
    // When the CloudFront value adapter registry is asked for one.
    const resolved = cloudFrontValueAdapter({
      logicalId: "SiteOac",
      type: "AWS::CloudFront::OriginAccessControl",
      simResource: originAccessControl,
    });

    // Then the origin access control's own adapter answers, rather than the
    // default one, which would answer a Ref with the logical ID.
    assertInstanceOf(resolved, SimCloudFrontOriginAccessControlCfn);
  });
});
