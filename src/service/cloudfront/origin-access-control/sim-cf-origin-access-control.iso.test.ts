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
      signingBehavior: "always",
    });

    // Then it keeps it rather than allocating one.
    assertIdentical(originAccessControl.id, "E1EXAMPLE12345");
  });

  it("only signs for an S3 Origin with SigV4", () => {
    // Given an origin access control.
    const originAccessControl = new SimCloudFrontOriginAccessControl({
      name: "site-oac",
      signingBehavior: "always",
    });

    // Then the origin type and signing protocol are the only ones modelled,
    // rather than whatever the template happened to ask for.
    assertIdentical(originAccessControl.originType, "s3");
    assertIdentical(originAccessControl.signingProtocol, "sigv4");
  });

  it("has no description unless it was given one", () => {
    // Given an origin access control created without a description.
    const originAccessControl = new SimCloudFrontOriginAccessControl({
      name: "site-oac",
      signingBehavior: "always",
    });

    assertUndefined(originAccessControl.description);
  });

  it("keeps the description it was created with", () => {
    // Given an origin access control created with a description.
    const originAccessControl = new SimCloudFrontOriginAccessControl({
      name: "site-oac",
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
      signingBehavior: "always",
    });
    const noOverride = new SimCloudFrontOriginAccessControl({
      name: "no-override-oac",
      signingBehavior: "no-override",
    });
    const never = new SimCloudFrontOriginAccessControl({
      name: "never-oac",
      signingBehavior: "never",
    });

    // Then only `never` turns the signing off. Nothing here sends a viewer's
    // own signature to an Origin, so `no-override` always signs.
    assertTrue(always.signs);
    assertTrue(noOverride.signs);
    assertFalse(never.signs);
  });
});
