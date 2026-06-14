import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simCloudFrontBehaviorFactory } from "../behaviour/sim-cloud-front-behavior.js";
import {
  makeDistributionId,
  SimCloudFrontDistribution,
} from "../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontBehaviorResolver } from "./sim-cloud-front-behavior-resolver.js";

describe("sim CloudFront Behavior resolver", () => {
  it("resolves to the default Behavior when its path pattern is undefined", () => {
    const defaultBehavior = simCloudFrontBehaviorFactory.make();
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    distribution.addBehavior(defaultBehavior);

    const behavior = new SimCloudFrontBehaviorResolver().resolve(
      new Request("https://example.test/assets/app.css"),
      distribution,
    );

    assertIdentical(behavior, defaultBehavior);
  });

  it("resolves to the default Behavior when its path pattern is *", () => {
    const defaultBehavior = simCloudFrontBehaviorFactory.make({
      pathPattern: "*",
    });
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    distribution.addBehavior(defaultBehavior);

    const behavior = new SimCloudFrontBehaviorResolver().resolve(
      new Request("https://example.test/assets/app.css"),
      distribution,
    );

    assertIdentical(behavior, defaultBehavior);
  });

  it("prefers an explicit matching Behavior over the default Behavior", () => {
    const defaultBehavior = simCloudFrontBehaviorFactory.make();
    const explicitBehavior = simCloudFrontBehaviorFactory.make({
      pathPattern: "/assets/*",
    });
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    distribution.addBehavior(defaultBehavior);
    distribution.addBehavior(explicitBehavior);

    const behavior = new SimCloudFrontBehaviorResolver().resolve(
      new Request("https://example.test/assets/app.css"),
      distribution,
    );

    assertIdentical(behavior, explicitBehavior);
  });

  it("prefers an explicit matching Behavior over the * default Behavior", () => {
    const defaultBehavior = simCloudFrontBehaviorFactory.make({
      pathPattern: "*",
    });
    const explicitBehavior = simCloudFrontBehaviorFactory.make({
      pathPattern: "/assets/*",
    });
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    distribution.addBehavior(defaultBehavior);
    distribution.addBehavior(explicitBehavior);

    const behavior = new SimCloudFrontBehaviorResolver().resolve(
      new Request("https://example.test/assets/app.css"),
      distribution,
    );

    assertIdentical(behavior, explicitBehavior);
  });

  it("matches single character for ? wildcard", () => {
    const defaultBehavior = simCloudFrontBehaviorFactory.make();
    const explicitBehavior = simCloudFrontBehaviorFactory.make({
      pathPattern: "/assets/?.css",
    });
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    distribution.addBehavior(defaultBehavior);
    distribution.addBehavior(explicitBehavior);

    const behavior = new SimCloudFrontBehaviorResolver().resolve(
      new Request("https://example.test/assets/a.css"),
      distribution,
    );

    assertIdentical(behavior, explicitBehavior);
  });

  it("resolves the most specific matching Behavior", () => {
    const broadBehavior = simCloudFrontBehaviorFactory.make({
      pathPattern: "/assets/*",
    });
    const specificBehavior = simCloudFrontBehaviorFactory.make({
      pathPattern: "/assets/app.css",
    });
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    distribution.addBehavior(broadBehavior);
    distribution.addBehavior(specificBehavior);

    const behavior = new SimCloudFrontBehaviorResolver().resolve(
      new Request("https://example.test/assets/app.css"),
      distribution,
    );

    assertIdentical(behavior, specificBehavior);
  });

  it("throws when no explicit or default Behavior can be resolved", () => {
    const distribution = new SimCloudFrontDistribution({
      distributionId: makeDistributionId(),
    });
    distribution.addBehavior(
      simCloudFrontBehaviorFactory.make({ pathPattern: "/assets/*" }),
    );

    const error = assertThrowsError(() => {
      new SimCloudFrontBehaviorResolver().resolve(
        new Request("https://example.test/index.html"),
        distribution,
      );
    });

    assertStringIncludes(
      error.message,
      `Default CloudFront Behavior for Distribution ${distribution.distributionId}`,
    );
  });
});
