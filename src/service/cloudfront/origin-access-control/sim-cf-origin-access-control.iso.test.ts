import {
  assertFalse,
  assertIdentical,
  assertStringLength,
  assertStringStartsWith,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimCloudFrontOriginAccessControl,
  type SimCloudFrontOriginAccessControlId,
} from "./sim-cf-origin-access-control.js";

describe("SimCloudFrontOriginAccessControl", () => {
  it("is given an ID in the shape CloudFront gives one", () => {
    // Given an origin access control created without an ID.
    const originAccessControl = new SimCloudFrontOriginAccessControl({
      name: "site-oac",
      originType: "s3",
      signingBehavior: "always",
    });

    // Then it allocated one of its own, which a template can Ref.
    assertStringStartsWith(originAccessControl.id, "E");
    assertStringLength(originAccessControl.id, 14);
  });

  it("keeps the ID it was created with", () => {
    // Given an origin access control created with an ID.
    const originAccessControl = new SimCloudFrontOriginAccessControl({
      id: "E1EXAMPLE12345" as SimCloudFrontOriginAccessControlId,
      name: "site-oac",
      originType: "s3",
      signingBehavior: "always",
    });

    // Then it keeps it rather than allocating one.
    assertIdentical(originAccessControl.id, "E1EXAMPLE12345");
  });

  it("keeps the origin type it signs for", () => {
    // Given origin access controls for each kind of Origin modelled.
    const bucketOac = new SimCloudFrontOriginAccessControl({
      name: "site-oac",
      originType: "s3",
      signingBehavior: "always",
    });
    const functionUrlOac = new SimCloudFrontOriginAccessControl({
      name: "api-oac",
      originType: "lambda",
      signingBehavior: "always",
    });

    // Then each says which Origin it signs for, which is what decides the
    // Origin it may be attached to.
    assertIdentical(bucketOac.originType, "s3");
    assertIdentical(functionUrlOac.originType, "lambda");
  });

  it("signs with SigV4, the only protocol CloudFront offers", () => {
    // Given an origin access control.
    const originAccessControl = new SimCloudFrontOriginAccessControl({
      name: "site-oac",
      originType: "s3",
      signingBehavior: "always",
    });

    assertIdentical(originAccessControl.signingProtocol, "sigv4");
  });

  it("has no description unless it was given one", () => {
    // Given an origin access control created without a description.
    const originAccessControl = new SimCloudFrontOriginAccessControl({
      name: "site-oac",
      originType: "s3",
      signingBehavior: "always",
    });

    assertUndefined(originAccessControl.description);
  });

  it("keeps the description it was created with", () => {
    // Given an origin access control created with a description.
    const originAccessControl = new SimCloudFrontOriginAccessControl({
      name: "site-oac",
      originType: "s3",
      description: "Signs reads of the site bucket",
      signingBehavior: "always",
    });

    assertIdentical(
      originAccessControl.description,
      "Signs reads of the site bucket",
    );
  });

  it("signs unless the signing behaviour says never", () => {
    // Given the three signing behaviours CloudFront offers.
    const always = new SimCloudFrontOriginAccessControl({
      name: "always-oac",
      originType: "s3",
      signingBehavior: "always",
    });
    const noOverride = new SimCloudFrontOriginAccessControl({
      name: "no-override-oac",
      originType: "s3",
      signingBehavior: "no-override",
    });
    const never = new SimCloudFrontOriginAccessControl({
      name: "never-oac",
      originType: "s3",
      signingBehavior: "never",
    });

    // Then only `never` turns the signing off. Nothing here sends a viewer's
    // own signature to an Origin, so `no-override` always signs.
    assertTrue(always.signs);
    assertTrue(noOverride.signs);
    assertFalse(never.signs);
  });
});
