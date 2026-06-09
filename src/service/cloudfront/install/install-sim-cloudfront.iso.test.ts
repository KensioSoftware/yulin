import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { installSimCloudFront } from "./install-sim-cloudfront.js";
import { SimCloudFront } from "../sim-cloudfront.js";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { installSimS3 } from "../../s3/index.js";
import { CreateBucketCommand } from "@aws-sdk/client-s3";

describe("Sim CloudFront installer", () => {
  it("installs sim CloudFront into top-level sim AWS", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.service("cloudFront" as never);
    });

    installSimCloudFront(simAws);

    const simCloudFront = simAws.service("cloudFront");

    assertInstanceOf(simCloudFront, SimCloudFront);
  });

  it("installs sim CloudFront into sim AWS Region", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.region("eu-west-2").service("cloudFront" as never);
    });

    installSimCloudFront(simAws);

    const simCloudFront = simAws.region("eu-west-2").service("cloudFront");

    assertInstanceOf(simCloudFront, SimCloudFront);
  });

  it("installs sim CloudFront into sim AWS Account", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.account("666666666666").service("cloudFront" as never);
    });

    installSimCloudFront(simAws);

    const simCloudFront = simAws.account("666666666666").service("cloudFront");

    assertInstanceOf(simCloudFront, SimCloudFront);
  });

  it("installs sim CloudFront into sim AWS Account Region scope", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws
        .account("666666666666")
        .region("eu-west-2")
        .service("cloudFront" as never);
    });

    installSimCloudFront(simAws);

    const simCloudFront = simAws
      .account("666666666666")
      .region("eu-west-2")
      .service("cloudFront");

    assertInstanceOf(simCloudFront, SimCloudFront);
  });

  it("errors on trying to install twice into the same SimAws", () => {
    const simAws = new SimAws();

    installSimCloudFront(simAws);

    const error = assertThrowsError(() => {
      installSimCloudFront(simAws);
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "Sim AWS service is already installed: cloudFront",
    );
  });

  it("errors when creating an S3 Origin without installing sim S3", async () => {
    const simAws = new SimAws();
    installSimCloudFront(simAws);

    const simCloudFront = simAws.service("cloudFront");

    const error = await assertThrowsErrorAsync(async () => {
      await simCloudFront.createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "s3-not-installed-test",
            Comment: "S3 not installed test CDN",
            Enabled: true,
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "site-origin",
                  DomainName: "missing-s3-install-bucket.s3.amazonaws.com",
                  S3OriginConfig: { OriginAccessIdentity: "" },
                },
              ],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "site-origin",
              ViewerProtocolPolicy: "allow-all",
            },
          },
        }),
      );
    });

    assertStringIncludes(
      error.message,
      "Sim AWS service is not installed: s3. Call installer function to install it.",
    );
  });

  it("lazily creates sim S3 when resolving an S3 Origin if S3 is installed but not already memoized", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);
    installSimCloudFront(simAws);

    const simCloudFront = simAws.service("cloudFront");

    await simAws
      .region("eu-west-2")
      .service("s3")
      .createBucket(
        new CreateBucketCommand({
          Bucket: "lazy-s3-origin-bucket",
        }),
      );

    await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "lazy-s3-origin-test",
          Comment: "Lazy S3 origin resolver test CDN",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "site-origin",
                DomainName: "lazy-s3-origin-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "site-origin",
            ViewerProtocolPolicy: "allow-all",
          },
        },
      }),
    );
  });
});
