import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimCloudFrontServiceController } from "./sim-cloudfront-controller.js";

describe("Simulated CloudFront local HTTP controller routing", () => {
  it("responds HTTP 404 when no Distribution matches the request host", async () => {
    const cfController = new SimCloudFrontServiceController();
    const res = await cfController.handleRequest(
      {
        service: "cloudFront",
        resourceName: "",
      },
      new Request("http://unknown.cloudfront.net.sim-aws.localhost/index.html"),
    );

    assertResponseStatus(res, 404, await describeResponse(res));
    assertStringIncludes(
      await res.text(),
      "Suitable sim CloudFront Distribution not found",
    );
  });

  it("routes a request to a Distribution by CloudFront Distribution hostname", async () => {
    const simAws = new SimAws();

    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "distro-host-bucket" }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "distro-host-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: "<h1>From Distribution host</h1>",
      }),
    );

    const cloudFront = simAws.cloudFront();
    const createDistributionOutput = await cloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "distro-host",
          Comment: "Foobar CDN",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "site-origin",
                DomainName: "distro-host-bucket.s3.amazonaws.com",
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

    const distributionId = createDistributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const cfController = new SimCloudFrontServiceController({
      simAws,
    });
    const res = await cfController.handleRequest(
      {
        service: "cloudFront",
        resourceName: "",
      },
      new Request(
        `http://${distributionId}.cloudfront.net.sim-aws.localhost/index.html`,
        {
          headers: {
            host: `${distributionId}.cloudfront.net.sim-aws.localhost`,
          },
        },
      ),
    );

    assertResponseStatus(res, 200, await describeResponse(res));
    assertIdentical(await res.text(), "<h1>From Distribution host</h1>");
    assertIdentical(res.headers.get("content-type"), "text/html");
  });

  it("uses the default Behavior when no explicit path pattern matches", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();
    await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "default-origin-bucket",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "default-origin-bucket",
        Key: "page.html",
        Body: "<h1>Default origin page</h1>",
      }),
    );

    await simAws.s3().createBucket(
      new CreateBucketCommand({
        Bucket: "asset-origin-bucket",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "asset-origin-bucket",
        Key: "page.html",
        Body: "<h1>Wrong origin page</h1>",
      }),
    );

    const cloudFront = simAws.cloudFront();
    const createDistributionOutput = await cloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "default-behavior",
          Comment: "Default Behavior test CDN",
          Enabled: true,
          Origins: {
            Quantity: 2,
            Items: [
              {
                Id: "default-origin",
                DomainName: "default-origin-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
              {
                Id: "asset-origin",
                DomainName: "asset-origin-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "default-origin",
            ViewerProtocolPolicy: "allow-all",
          },
          CacheBehaviors: {
            Quantity: 1,
            Items: [
              {
                PathPattern: "/assets/*",
                TargetOriginId: "asset-origin",
                ViewerProtocolPolicy: "allow-all",
              },
            ],
          },
        },
      }),
    );

    const distributionId = createDistributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const cfController = new SimCloudFrontServiceController({
      simAws,
    });
    const res = await cfController.handleRequest(
      {
        service: "cloudFront",
        resourceName: "",
      },
      new Request(
        `http://${distributionId}.cloudfront.net.sim-aws.localhost/page.html`,
      ),
    );

    assertResponseStatus(res, 200, await describeResponse(res));
    assertIdentical(await res.text(), "<h1>Default origin page</h1>");
  });

  it("uses the most specific matching Behavior for the request path", async () => {
    const simAws = new SimAws();

    await simAws.s3().createBucket(
      new CreateBucketCommand({
        Bucket: "specific-default-bucket",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "specific-default-bucket",
        Key: "assets/images/logo.png",
        Body: "default logo",
      }),
    );

    await simAws.s3().createBucket(
      new CreateBucketCommand({
        Bucket: "specific-assets-bucket",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "specific-assets-bucket",
        Key: "assets/images/logo.png",
        Body: "asset logo",
      }),
    );

    await simAws.s3().createBucket(
      new CreateBucketCommand({
        Bucket: "specific-images-bucket",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "specific-images-bucket",
        Key: "public/assets/images/logo.png",
        Body: "image logo",
      }),
    );

    const cloudFront = simAws.cloudFront();
    const createDistributionOutput = await cloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "specific-behavior",
          Comment: "Specific Behavior test CDN",
          Enabled: true,
          Origins: {
            Quantity: 3,
            Items: [
              {
                Id: "default-origin",
                DomainName: "specific-default-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
              {
                Id: "asset-origin",
                DomainName: "specific-assets-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
              {
                Id: "image-origin",
                DomainName: "specific-images-bucket.s3.amazonaws.com",
                OriginPath: "/public",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "default-origin",
            ViewerProtocolPolicy: "allow-all",
          },
          CacheBehaviors: {
            Quantity: 2,
            Items: [
              {
                PathPattern: "/assets/*",
                TargetOriginId: "asset-origin",
                ViewerProtocolPolicy: "allow-all",
              },
              {
                PathPattern: "/assets/images/*",
                TargetOriginId: "image-origin",
                ViewerProtocolPolicy: "allow-all",
              },
            ],
          },
        },
      }),
    );

    const distributionId = createDistributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const cfController = new SimCloudFrontServiceController({
      simAws,
    });
    const res = await cfController.handleRequest(
      {
        service: "cloudFront",
        resourceName: "",
      },
      new Request(
        `http://${distributionId}.cloudfront.net.sim-aws.localhost/assets/images/logo.png`,
      ),
    );

    assertResponseStatus(res, 200, await describeResponse(res));
    assertIdentical(await res.text(), "image logo");
  });
});
