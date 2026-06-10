import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimCloudFrontServiceController } from "./sim-cloudfront-controller.js";

describe("Simulated CloudFront local HTTP controller request handling", () => {
  it("passes HEAD requests through to the S3 Origin without a response body", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();
    await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "head-request-bucket",
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "head-request-bucket",
        Key: "api/users.json",
        ContentType: "application/json",
        Body: JSON.stringify([{ name: "Ada" }]),
      }),
    );

    const cloudFront = simAws.cloudFront();
    const createDistributionOutput = await cloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "head-request-test",
          Comment: "HEAD request test CDN",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "api-origin",
                DomainName: "head-request-bucket.s3.amazonaws.com",
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
                PathPattern: "/api/*",
                TargetOriginId: "api-origin",
                ViewerProtocolPolicy: "allow-all",
              },
            ],
          },
        },
      }),
    );

    const distributionId = createDistributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const res = await new SimCloudFrontServiceController({
      cloudFront,
    }).handleRequest(
      {
        service: "cloudFront",
        resourceName: "",
      },
      new Request(
        `http://${distributionId}.cloudfront.net.localhost/api/users.json`,
        { method: "HEAD" },
      ),
    );

    assertIdentical(res.status, 200);
    assertIdentical(await res.text(), "");
    assertIdentical(res.headers.get("content-type"), "application/json");
  });

  it("returns HTTP 405 when the S3 Origin receives an unsupported request method", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();
    await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "unsupported-method-bucket",
      }),
    );

    const cloudFront = simAws.cloudFront();
    const createDistributionOutput = await cloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "unsupported-method-test",
          Comment: "Unsupported method test CDN",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "site-origin",
                DomainName: "unsupported-method-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "site-origin",
            ViewerProtocolPolicy: "allow-all",
            AllowedMethods: {
              Quantity: 3,
              Items: ["GET", "HEAD", "POST"],
              CachedMethods: {
                Quantity: 2,
                Items: ["GET", "HEAD"],
              },
            },
          },
        },
      }),
    );

    const distributionId = createDistributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const res = await new SimCloudFrontServiceController({
      cloudFront,
    }).handleRequest(
      {
        service: "cloudFront",
        resourceName: "",
      },
      new Request(
        `http://${distributionId}.cloudfront.net.localhost/index.html`,
        { method: "POST" },
      ),
    );

    assertIdentical(res.status, 405);
    assertIdentical(res.headers.get("allow"), "GET, HEAD");
    assertIdentical(
      res.headers.get("content-type"),
      "text/plain; charset=utf-8",
    );
    assertIdentical(await res.text(), "Method POST not allowed");
  });

  it("returns the S3 Origin not found response when the selected Origin has no matching object", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();
    await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "not-found-bucket",
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "not-found-bucket",
        Key: "existing.html",
        Body: "<h1>Existing</h1>",
      }),
    );

    const cloudFront = simAws.cloudFront();
    const createDistributionOutput = await cloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "not-found-test",
          Comment: "Not found test CDN",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "site-origin",
                DomainName: "not-found-bucket.s3.amazonaws.com",
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

    const res = await new SimCloudFrontServiceController({
      cloudFront,
    }).handleRequest(
      {
        service: "cloudFront",
        resourceName: "",
      },
      new Request(
        `http://${distributionId}.cloudfront.net.localhost/missing.html`,
      ),
    );

    assertIdentical(res.status, 404);
    assertStringIncludes(
      await res.text(),
      "Object missing.html not found in sim S3 Bucket not-found-bucket",
    );
  });

  it("responds HTTP 501 when the resolved Behavior references a missing Origin", async () => {
    const simAws = new SimAws();

    const cloudFront = simAws.cloudFront();
    const createDistributionOutput = await cloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "missing-origin-test",
          Comment: "Missing Origin test CDN",
          Enabled: true,
          Origins: {
            Quantity: 0,
            Items: [],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "missing-origin",
            ViewerProtocolPolicy: "allow-all",
          },
        },
      }),
    );

    const distributionId = createDistributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const res = await new SimCloudFrontServiceController({
      cloudFront,
    }).handleRequest(
      {
        service: "cloudFront",
        resourceName: "",
      },
      new Request(
        `http://${distributionId}.cloudfront.net.localhost/index.html`,
        {
          headers: {
            host: `${distributionId}.cloudfront.net.localhost`,
          },
        },
      ),
    );

    assertIdentical(res.status, 501);
    assertStringIncludes(
      await res.text(),
      "Sim CloudFront Distribution misconfigured for Origin missing-origin",
    );
  });
});
