import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertStringLength,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimCloudFrontBehavior } from "../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontOrigin } from "../origin/sim-cloudfront-origin.js";
import {
  makeDistributionId,
  SimCloudFrontDistribution,
  type SimCloudFrontDistributionId,
} from "./sim-cloudfront-distribution.js";

describe("SimCloudFrontDistribution", () => {
  it("sets the Distribution ID", () => {
    const distributionId = "E123456789ABCD" as SimCloudFrontDistributionId;

    const distribution = new SimCloudFrontDistribution({ distributionId });

    assertIdentical(distribution.distributionId, distributionId);
  });

  it("adds and checks alternate domain names", () => {
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });

    distribution.addAlternateDomainName("cdn.example.com");
    distribution.addAlternateDomainName("static.example.com");

    assertTrue(distribution.hasAlternateDomainName("cdn.example.com"));
    assertTrue(distribution.hasAlternateDomainName("static.example.com"));
    assertFalse(distribution.hasAlternateDomainName("missing.example.com"));
  });

  it("stores alternate domain names as a Set", () => {
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });

    distribution.addAlternateDomainName("cdn.example.com");
    distribution.addAlternateDomainName("cdn.example.com");

    const alternateDomainNames = distribution.getAlternateDomainNames();

    assertIdentical(alternateDomainNames.size, 1);
    assertTrue(alternateDomainNames.has("cdn.example.com"));
  });

  it("adds Behaviors in insertion order", () => {
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    const firstBehavior: SimCloudFrontBehavior = {
      targetOriginName: "origin-a",
      allowedMethods: new Set(["GET", "HEAD"]),
      cachedMethods: new Set(["GET", "HEAD"]),
    };
    const secondBehavior: SimCloudFrontBehavior = {
      pathPattern: "/assets/*",
      targetOriginName: "origin-b",
      allowedMethods: new Set(["GET", "HEAD", "OPTIONS"]),
      cachedMethods: new Set(["GET", "HEAD"]),
    };

    distribution.addBehavior(firstBehavior);
    distribution.addBehavior(secondBehavior);

    assertArrayLength(distribution.behaviors, 2);
    assertIdentical(distribution.behaviors[0], firstBehavior);
    assertIdentical(distribution.behaviors[1], secondBehavior);
  });

  it("adds and gets Origins by name", () => {
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    const origin = makeOrigin();

    distribution.addOrigin("origin-a", origin);

    assertIdentical(distribution.getOrigin("origin-a"), origin);
    assertUndefined(distribution.getOrigin("missing-origin"));
  });

  it("stores Origins in a map keyed by Origin name", () => {
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    const originA = makeOrigin();
    const originB = makeOrigin();

    distribution.addOrigin("origin-a", originA);
    distribution.addOrigin("origin-b", originB);

    const origins = distribution.getOrigins();

    assertIdentical(origins.size, 2);
    assertIdentical(origins.get("origin-a"), originA);
    assertIdentical(origins.get("origin-b"), originB);
  });

  it("replaces an Origin with the same name", () => {
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    const originalOrigin = makeOrigin();
    const replacementOrigin = makeOrigin();

    distribution.addOrigin("origin-a", originalOrigin);
    distribution.addOrigin("origin-a", replacementOrigin);

    assertIdentical(distribution.getOrigins().size, 1);
    assertIdentical(distribution.getOrigin("origin-a"), replacementOrigin);
  });

  it("generates CloudFront-like Distribution IDs", () => {
    const distributionId = makeDistributionId();

    assertStringLength(distributionId, 14);
    assertIdentical(distributionId[0], "E");
  });
});

function makeOrigin(): SimCloudFrontOrigin {
  return {
    fetch() {
      return Promise.resolve(new Response("ok"));
    },
  };
}
