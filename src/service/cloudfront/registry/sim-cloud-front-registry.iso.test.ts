import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontRegistry } from "./sim-cloud-front-registry.js";
import type { SimCloudFrontDistributionId } from "../distribution/sim-cloudfront-distribution.js";

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
});
