import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontRegistry } from "./sim-cloud-front-registry.js";
import type { SimCloudFrontDistributionId } from "../distribution/sim-cloudfront-distribution.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";

describe("SimCloudFrontRegistry", () => {
  it("throws when an alternate domain name is registered to a different Distribution", () => {
    const registry = new SimCloudFrontRegistry();

    registry.registerAlternateDomainName(
      "cdn.example.test",
      "EDISTRIBUTION01" as SimCloudFrontDistributionId,
    );

    const error = assertThrowsError(() => {
      registry.registerAlternateDomainName(
        "cdn.example.test",
        "EDISTRIBUTION02" as SimCloudFrontDistributionId,
      );
    });

    assertStringIncludes(
      error.message,
      "Sim CloudFront alternate domain name cdn.example.test is already registered to Distribution EDISTRIBUTION01",
    );
  });

  it("releases an alternate domain name once its Distribution is deregistered", () => {
    // Given a Distribution registered with an alternate domain name.
    const registry = new SimCloudFrontRegistry();
    const distributionId = "EDISTRIBUTION01" as SimCloudFrontDistributionId;

    registry.registerDistribution(
      distributionId,
      "111111111111" as SimAwsAccountId,
    );
    registry.registerAlternateDomainName("cdn.example.test", distributionId);

    // When the Distribution is deregistered.
    registry.deregisterDistribution(distributionId);

    // Then nothing is left pointing at it, and another Distribution can take
    // the alternate domain name.
    assertUndefined(registry.accountIdForDistribution(distributionId));
    assertUndefined(
      registry.distributionIdForAlternateDomainName("cdn.example.test"),
    );

    registry.registerAlternateDomainName(
      "cdn.example.test",
      "EDISTRIBUTION02" as SimCloudFrontDistributionId,
    );
    assertIdentical(
      registry.distributionIdForAlternateDomainName("cdn.example.test"),
      "EDISTRIBUTION02",
    );
  });

  it("ignores a Distribution ID that was never registered", () => {
    // Given a registry that has never seen the Distribution ID.
    const registry = new SimCloudFrontRegistry();

    // When it is deregistered anyway.
    registry.deregisterDistribution(
      "EDISTRIBUTION03" as SimCloudFrontDistributionId,
    );

    // Then nothing happens, rather than a failure part way through a deletion.
    assertUndefined(
      registry.accountIdForDistribution(
        "EDISTRIBUTION03" as SimCloudFrontDistributionId,
      ),
    );
  });
});
