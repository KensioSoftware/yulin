import { describe, it } from "vitest";
import { SimCloudFrontDistroRouter } from "./sim-cloud-front-distro-router.js";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import {
  SimCloudFrontDistribution,
  type SimCloudFrontDistributionId,
} from "../distribution/sim-cloudfront-distribution.js";
import { SimAws } from "../../aws/sim-aws.js";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimCloudFrontRegistry } from "../registry/sim-cloud-front-registry.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { extractCloudFrontHostDistroId } from "./distro-id/extract-cf-host-distro-id.js";

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

    it("routes request by registered CloudFront distribution ID", async () => {
      const simAws = new SimAws();
      const account = simAws.account("555555555555");
      const simS3 = account.s3();
      const simCloudFront = account.cloudFront();

      await simS3.createBucket(
        new CreateBucketCommand({
          Bucket: "assets.example.test",
        }),
      );

      const output = await simCloudFront.createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "registered-distribution-id",
            Comment: "Registered Distribution",
            Enabled: true,
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "s3-assets",
                  DomainName: "assets.example.test.s3.amazonaws.com",
                  S3OriginConfig: {
                    OriginAccessIdentity: "",
                  },
                },
              ],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "s3-assets",
              ViewerProtocolPolicy: "allow-all",
            },
          },
        }),
      );

      assertNonNullable(output.Distribution);
      assertNonNullable(output.Distribution.Id);

      const distribution = simCloudFront
        .getDistributions()
        .get(output.Distribution.Id as SimCloudFrontDistributionId);

      assertNonNullable(distribution);

      const router = new SimCloudFrontDistroRouter({
        simAws,
        cloudFrontRegistry: simAws.cloudFrontRegistry(),
      });

      const request = new Request(
        `http://${output.Distribution.Id.toLowerCase()}.cloudfront.net/`,
      );

      assertIdentical(router.distroForRequest(request), distribution);
    });

    it("returns undefined when registered distribution does not exist", () => {
      const simAws = new SimAws();
      const cloudFrontRegistry = new SimCloudFrontRegistry();
      const distributionId = "ENOTREGISTERED1" as SimCloudFrontDistributionId;

      cloudFrontRegistry.registerDistribution(
        distributionId,
        "555555555555" as SimAwsAccountId,
      );

      const router = new SimCloudFrontDistroRouter({
        simAws,
        cloudFrontRegistry,
      });

      const request = new Request(
        `http://${distributionId.toLowerCase()}.cloudfront.net/`,
      );

      assertUndefined(router.distroForRequest(request));
    });

    it("routes request by registered alternate domain name", async () => {
      const simAws = new SimAws();
      const account = simAws.account("555555555555");
      const simS3 = account.s3();
      const simCloudFront = account.cloudFront();

      await simS3.createBucket(
        new CreateBucketCommand({
          Bucket: "assets.example.test",
        }),
      );

      const output = await simCloudFront.createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "registered-alternate-domain-name",
            Comment: "Registered Distribution",
            Enabled: true,
            Aliases: {
              Quantity: 1,
              Items: ["cdn.example.test"],
            },
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "s3-assets",
                  DomainName: "assets.example.test.s3.amazonaws.com",
                  S3OriginConfig: {
                    OriginAccessIdentity: "",
                  },
                },
              ],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "s3-assets",
              ViewerProtocolPolicy: "allow-all",
            },
          },
        }),
      );

      assertNonNullable(output.Distribution);
      assertNonNullable(output.Distribution.Id);

      const distribution = simCloudFront
        .getDistributions()
        .get(output.Distribution.Id as SimCloudFrontDistributionId);

      assertNonNullable(distribution);

      const router = new SimCloudFrontDistroRouter({
        simAws,
        cloudFrontRegistry: simAws.cloudFrontRegistry(),
      });

      const request = new Request("http://cdn.example.test/foo/bar.json");

      assertIdentical(router.distroForRequest(request), distribution);
    });
  });

  describe("extract Distribution ID from hostname", () => {
    it("matches cloudfront distro hostname alone", () => {
      const distributionId = extractCloudFrontHostDistroId(
        "distro123.cloudfront.net",
      );
      assertIdentical(distributionId, "DISTRO123");
    });

    it("matches cloudfront distro hostname prefix", () => {
      const distributionId = extractCloudFrontHostDistroId(
        "distro123.cloudfront.net.sim-aws.localhost",
      );
      assertIdentical(distributionId, "DISTRO123");
    });

    it("does not match non-CloudFront hostname", () => {
      const distributionId = extractCloudFrontHostDistroId(
        "distro123.foo.net.sim-aws.localhost",
      );
      assertUndefined(distributionId);
    });

    it("does not match non-net TLD", () => {
      const distributionId = extractCloudFrontHostDistroId(
        "distro123.cloudfront.com.sim-aws.localhost",
      );
      assertUndefined(distributionId);
    });

    it("does not match short hostname", () => {
      const distributionId = extractCloudFrontHostDistroId("sim-aws.localhost");
      assertUndefined(distributionId);
    });
  });
});
