import { describe, it } from "vitest";
import { SimCloudFrontDistroRouter } from "./sim-cloud-front-distro-router.js";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import {
  SimCloudFrontDistribution,
  type SimCloudFrontDistributionId,
} from "../distribution/sim-cloudfront-distribution.js";

describe("Sim CloudFront Distribution Router", () => {
  describe("route requests to distributions", () => {
    it("routes request by CloudFront distribution ID in hostname", () => {
      const distro = new SimCloudFrontDistribution();

      const router = SimCloudFrontDistroRouter.fromDistributions([distro]);

      const request = new Request(
        `http://${distro.distributionId.toLowerCase()}.cloudfront.net.sim-aws.localhost/`,
      );

      assertIdentical(router.distroForRequest(request), distro);
    });

    it("routes request by alternate domain name", () => {
      const distro = new SimCloudFrontDistribution();
      distro.addAlternateDomainName("cdn.example.test");

      const router = SimCloudFrontDistroRouter.fromDistributions([distro]);

      const request = new Request(`http://cdn.example.test/foo/bar.json`);

      assertIdentical(router.distroForRequest(request), distro);
    });

    it("returns undefined when no distribution matches", () => {
      const distro = new SimCloudFrontDistribution();

      const router = SimCloudFrontDistroRouter.fromDistributions([distro]);

      const request = new Request("http://unknown.example.test/path/to/object");

      assertUndefined(router.distroForRequest(request));
    });

    it("returns undefined when distributions map is empty", () => {
      const router = new SimCloudFrontDistroRouter({
        distributions: new Map(),
      });

      const request = new Request("http://distribution123.cloudfront.net/");

      assertUndefined(router.distroForRequest(request));
    });

    it("handles hostname without .sim-aws.localhost suffix", () => {
      const distro = new SimCloudFrontDistribution();

      const router = SimCloudFrontDistroRouter.fromDistributions([distro]);

      const request = new Request(
        `http://${distro.distributionId.toLowerCase()}.cloudfront.net/`,
      );

      assertIdentical(router.distroForRequest(request), distro);
    });

    it("prefers host header over req url host", () => {
      const distro1 = new SimCloudFrontDistribution();
      const distro2 = new SimCloudFrontDistribution();
      distro2.addAlternateDomainName("cdn.example.test");

      const router = SimCloudFrontDistroRouter.fromDistributions([
        distro1,
        distro2,
      ]);

      const request = new Request("http://cdn.example.test/path/to/object", {
        headers: {
          host: `${distro1.distributionId.toLowerCase()}.cloudfront.net.sim-aws.localhost`,
        },
      });

      assertIdentical(router.distroForRequest(request), distro1);
    });

    it("handles case-insensitive distribution ID matching", () => {
      const distro = new SimCloudFrontDistribution({
        distributionId: "EOT12HUY8E5GFA" as SimCloudFrontDistributionId,
      });

      const router = SimCloudFrontDistroRouter.fromDistributions([distro]);

      const request = new Request(
        "http://eOT12hUy8E5gFa.cloudfront.net.sim-aws.localhost",
      );

      assertIdentical(router.distroForRequest(request), distro);
    });
  });

  describe("extract Distribution ID from hostname", () => {
    it("matches cloudfront distro hostname alone", () => {
      const distributionId = SimCloudFrontDistroRouter.extractHostDistroId(
        "distro123.cloudfront.net",
      );
      assertIdentical(distributionId, "DISTRO123");
    });

    it("matches cloudfront distro hostname prefix", () => {
      const distributionId = SimCloudFrontDistroRouter.extractHostDistroId(
        "distro123.cloudfront.net.sim-aws.localhost",
      );
      assertIdentical(distributionId, "DISTRO123");
    });

    it("does not match non-CloudFront hostname", () => {
      const distributionId = SimCloudFrontDistroRouter.extractHostDistroId(
        "distro123.foo.net.sim-aws.localhost",
      );
      assertUndefined(distributionId);
    });

    it("does not match non-net TLD", () => {
      const distributionId = SimCloudFrontDistroRouter.extractHostDistroId(
        "distro123.cloudfront.com.sim-aws.localhost",
      );
      assertUndefined(distributionId);
    });

    it("does not match short hostname", () => {
      const distributionId =
        SimCloudFrontDistroRouter.extractHostDistroId("sim-aws.localhost");
      assertUndefined(distributionId);
    });
  });
});
