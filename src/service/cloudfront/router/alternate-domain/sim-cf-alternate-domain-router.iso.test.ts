import { describe, it } from "vitest";
import { assertUndefined } from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontRegistry } from "../../registry/sim-cloud-front-registry.js";
import { SimCloudFrontAlternateDomainRouter } from "./sim-cf-alternate-domain-router.js";
import type { SimCloudFrontDistributionId } from "../../distribution/sim-cloudfront-distribution.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";

describe("Sim CloudFront Alternate Domain Router", () => {
  describe("route alternate domain names to distributions", () => {
    it("returns undefined when alternate domain name is not registered", () => {
      const router = new SimCloudFrontAlternateDomainRouter({
        simAws: new SimAws(),
        cloudFrontRegistry: new SimCloudFrontRegistry(),
      });

      assertUndefined(
        router.routeForAlternateDomainName("unknown.example.test"),
      );
    });

    it("returns undefined when registered alternate domain distribution has no account", () => {
      const cloudFrontRegistry = new SimCloudFrontRegistry();
      cloudFrontRegistry.registerAlternateDomainName(
        "cdn.example.test",
        "ENOTREGISTERED1" as SimCloudFrontDistributionId,
      );

      const router = new SimCloudFrontAlternateDomainRouter({
        simAws: new SimAws(),
        cloudFrontRegistry,
      });

      assertUndefined(router.routeForAlternateDomainName("cdn.example.test"));
    });

    it("returns undefined when registered alternate domain distribution does not exist", () => {
      const accountId = "555555555555" as SimAwsAccountId;
      const distributionId = "ENOTREGISTERED1" as SimCloudFrontDistributionId;
      const cloudFrontRegistry = new SimCloudFrontRegistry();

      cloudFrontRegistry.registerDistribution(distributionId, accountId);
      cloudFrontRegistry.registerAlternateDomainName(
        "cdn.example.test",
        distributionId,
      );

      const router = new SimCloudFrontAlternateDomainRouter({
        simAws: new SimAws(),
        cloudFrontRegistry,
      });

      assertUndefined(router.routeForAlternateDomainName("cdn.example.test"));
    });
  });
});
