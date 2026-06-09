import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";
import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import { installSimS3 } from "../../s3/index.js";
import { installSimCloudFront } from "../install/install-sim-cloudfront.js";
import { SimCloudFrontServiceController } from "./sim-cloudfront-controller.js";
import { SimCloudFront } from "../sim-cloudfront.js";

const cloudFrontTarget: SimAwsServiceTarget = {
  service: "cloudFront",
  resourceName: "",
};

describe("Simulated CloudFront local HTTP controller", () => {
  it("responds HTTP 404 when no Distribution matches the request host", async () => {
    const res = await new SimCloudFrontServiceController(
      new SimCloudFront(),
    ).handleRequest(
      cloudFrontTarget,
      new Request("http://unknown.cloudfront.net.localhost/index.html"),
    );

    assertIdentical(res.status, 404);
    assertStringIncludes(
      await res.text(),
      "Suitable sim CloudFront Distribution not found",
    );
  });

  it("routes a request to a Distribution by CloudFront Distribution hostname", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);
    installSimCloudFront(simAws);

    await simAws
      .service("s3")
      .createBucket(new CreateBucketCommand({ Bucket: "distro-host-bucket" }));
    await simAws.service("s3").putObject(
      new PutObjectCommand({
        Bucket: "distro-host-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: "<h1>From Distribution host</h1>",
      }),
    );

    const cloudFront = simAws.service("cloudFront");
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

    const res = await new SimCloudFrontServiceController(
      cloudFront,
    ).handleRequest(
      cloudFrontTarget,
      new Request(
        `http://${distributionId}.cloudfront.net.localhost/index.html`,
        {
          // Test taking the hostname from the host header and not the URL.
          headers: {
            host: `${distributionId}.cloudfront.net.localhost`,
          },
        },
      ),
    );

    assertIdentical(res.status, 200);
    assertIdentical(await res.text(), "<h1>From Distribution host</h1>");
    assertIdentical(res.headers.get("content-type"), "text/html");
  });

  it("uses the default Behavior when no explicit path pattern matches", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);
    installSimCloudFront(simAws);

    const simS3 = simAws.service("s3");
    await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "default-origin-bucket",
      }),
    );
    await simAws.service("s3").putObject(
      new PutObjectCommand({
        Bucket: "default-origin-bucket",
        Key: "page.html",
        Body: "<h1>Default origin page</h1>",
      }),
    );

    await simAws.service("s3").createBucket(
      new CreateBucketCommand({
        Bucket: "asset-origin-bucket",
      }),
    );
    await simAws.service("s3").putObject(
      new PutObjectCommand({
        Bucket: "asset-origin-bucket",
        Key: "page.html",
        Body: "<h1>Wrong origin page</h1>",
      }),
    );

    const cloudFront = simAws.service("cloudFront");
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

    const res = await new SimCloudFrontServiceController(
      cloudFront,
    ).handleRequest(
      cloudFrontTarget,
      new Request(
        `http://${distributionId}.cloudfront.net.localhost/page.html`,
      ),
    );

    assertIdentical(res.status, 200);
    assertIdentical(await res.text(), "<h1>Default origin page</h1>");
  });

  it("uses the most specific matching Behavior for the request path", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);
    installSimCloudFront(simAws);

    await simAws.service("s3").createBucket(
      new CreateBucketCommand({
        Bucket: "specific-default-bucket",
      }),
    );
    await simAws.service("s3").putObject(
      new PutObjectCommand({
        Bucket: "specific-default-bucket",
        Key: "assets/images/logo.png",
        Body: "default logo",
      }),
    );

    await simAws.service("s3").createBucket(
      new CreateBucketCommand({
        Bucket: "specific-assets-bucket",
      }),
    );
    await simAws.service("s3").putObject(
      new PutObjectCommand({
        Bucket: "specific-assets-bucket",
        Key: "assets/images/logo.png",
        Body: "asset logo",
      }),
    );

    await simAws.service("s3").createBucket(
      new CreateBucketCommand({
        Bucket: "specific-images-bucket",
      }),
    );
    await simAws.service("s3").putObject(
      new PutObjectCommand({
        Bucket: "specific-images-bucket",
        Key: "public/assets/images/logo.png",
        Body: "image logo",
      }),
    );

    const cloudFront = simAws.service("cloudFront");
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

    const res = await new SimCloudFrontServiceController(
      cloudFront,
    ).handleRequest(
      cloudFrontTarget,
      new Request(
        `http://${distributionId}.cloudfront.net.localhost/assets/images/logo.png`,
      ),
    );

    assertIdentical(res.status, 200);
    assertIdentical(await res.text(), "image logo");
  });

  it("passes HEAD requests through to the S3 Origin without a response body", async () => {
    const simAws = new SimAws();
    installSimS3(simAws);
    installSimCloudFront(simAws);

    const simS3 = simAws.service("s3");
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

    const cloudFront = simAws.service("cloudFront");
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

    const res = await new SimCloudFrontServiceController(
      cloudFront,
    ).handleRequest(
      cloudFrontTarget,
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
    installSimS3(simAws);
    installSimCloudFront(simAws);

    const simS3 = simAws.service("s3");
    await simS3.createBucket(
      new CreateBucketCommand({
        Bucket: "unsupported-method-bucket",
      }),
    );

    const cloudFront = simAws.service("cloudFront");
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

    const res = await new SimCloudFrontServiceController(
      cloudFront,
    ).handleRequest(
      cloudFrontTarget,
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
    installSimS3(simAws);
    installSimCloudFront(simAws);

    const simS3 = simAws.service("s3");
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

    const cloudFront = simAws.service("cloudFront");
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

    const res = await new SimCloudFrontServiceController(
      cloudFront,
    ).handleRequest(
      cloudFrontTarget,
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
    installSimCloudFront(simAws);

    const cloudFront = simAws.service("cloudFront");
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

    const res = await new SimCloudFrontServiceController(
      cloudFront,
    ).handleRequest(
      cloudFrontTarget,
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
