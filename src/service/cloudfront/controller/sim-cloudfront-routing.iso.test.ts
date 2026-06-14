import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  CreateDistributionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";
import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimCloudFrontServiceController } from "./sim-cloudfront-controller.js";
import { makeCffFunctionCodeInput } from "../cff/function-code-input/cff-function-code-input.js";
import { makeAwsRegionName } from "../../aws/sim-aws-region.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

const cloudFrontTarget: SimAwsServiceTarget = {
  service: "cloudFront",
  resourceName: "",
};

describe("Simulated CloudFront local HTTP controller routing", () => {
  it("responds HTTP 404 when no Distribution matches the request host", async () => {
    const res = await new SimCloudFrontServiceController().handleRequest(
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

    const res = await new SimCloudFrontServiceController({
      simAws,
    }).handleRequest(
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

    assertIdentical(res.status, 200);
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

    const res = await new SimCloudFrontServiceController({
      simAws,
    }).handleRequest(
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

    const res = await new SimCloudFrontServiceController({
      simAws,
    }).handleRequest(
      cloudFrontTarget,
      new Request(
        `http://${distributionId}.cloudfront.net.localhost/assets/images/logo.png`,
      ),
    );

    assertIdentical(res.status, 200);
    assertIdentical(await res.text(), "image logo");
  });

  it("applies a CFF associated with a Distribution created through another Region in the same Account", async () => {
    const simAws = new SimAws();
    const regionA = makeAwsRegionName();
    const regionB = makeAwsRegionName();

    const cffOutput = await simAws
      .region(regionA)
      .cloudFront()
      .createFunction(
        new CreateFunctionCommand({
          Name: "same-account-cross-region-cff",
          FunctionConfig: {
            Comment: "Same Account cross-Region CFF",
            Runtime: "cloudfront-js-2.0",
          },
          FunctionCode: makeCffFunctionCodeInput(
            (event: CloudFrontFunction.ViewerRequestEvent) => ({
              statusCode: event.request.uri === "/index.html" ? 204 : 400,
              headers: {
                "x-cff-resolved": {
                  value: "same-account",
                },
              },
            }),
          ),
        }),
      );

    const distributionOutput = await simAws
      .region(regionB)
      .cloudFront()
      .createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "same-account-cross-region-cff",
            Comment: "Same Account cross-Region CFF Distribution",
            Enabled: true,
            Origins: {
              Quantity: 0,
              Items: [],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "unused-origin",
              ViewerProtocolPolicy: "allow-all",
              FunctionAssociations: {
                Quantity: 1,
                Items: [
                  {
                    EventType: "viewer-request",
                    FunctionARN: cffOutput.FunctionMetadata.FunctionARN,
                  },
                ],
              },
            },
          },
        }),
      );

    const distributionId = distributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const res = await new SimCloudFrontServiceController({
      simAws,
    }).handleRequest(
      cloudFrontTarget,
      new Request(
        `http://${distributionId}.cloudfront.net.localhost/index.html`,
      ),
    );

    assertIdentical(res.status, 204);
    assertIdentical(res.headers.get("x-cff-resolved"), "same-account");
  });

  it("does not resolve a CFF from another Account", async () => {
    const simAws = new SimAws();
    const accountA = "111111111111";
    const accountB = "222222222222";
    const functionName = "cross-account-cff";

    await simAws
      .account(accountA)
      .cloudFront()
      .createFunction(
        new CreateFunctionCommand({
          Name: functionName,
          FunctionConfig: {
            Comment: "Same-name CFF in Distribution Account",
            Runtime: "cloudfront-js-2.0",
          },
          FunctionCode: makeCffFunctionCodeInput(
            (event: CloudFrontFunction.ViewerRequestEvent) => {
              event.request.headers["x-cff-resolved"] = {
                value: "wrong-account",
              };
              return event.request;
            },
          ),
        }),
      );

    const accountBCffOutput = await simAws
      .account(accountB)
      .cloudFront()
      .createFunction(
        new CreateFunctionCommand({
          Name: functionName,
          FunctionConfig: {
            Comment: "CFF in another Account",
            Runtime: "cloudfront-js-2.0",
          },
          FunctionCode: makeCffFunctionCodeInput(
            (event: CloudFrontFunction.ViewerRequestEvent) => {
              event.request.headers["x-cff-resolved"] = {
                value: "other-account",
              };
              return event.request;
            },
          ),
        }),
      );

    const distributionOutput = await simAws
      .account(accountA)
      .cloudFront()
      .createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "cross-account-cff",
            Comment: "Cross-Account CFF Distribution",
            Enabled: true,
            Origins: {
              Quantity: 0,
              Items: [],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "unused-origin",
              ViewerProtocolPolicy: "allow-all",
              FunctionAssociations: {
                Quantity: 1,
                Items: [
                  {
                    EventType: "viewer-request",
                    FunctionARN: accountBCffOutput.FunctionMetadata.FunctionARN,
                  },
                ],
              },
            },
          },
        }),
      );

    const distributionId = distributionOutput.Distribution?.Id;
    assertNonNullable(distributionId);

    const error = await assertThrowsErrorAsync(async () => {
      await new SimCloudFrontServiceController({
        simAws,
      }).handleRequest(
        cloudFrontTarget,
        new Request(
          `http://${distributionId}.cloudfront.net.localhost/index.html`,
        ),
      );
    });

    assertStringIncludes(error.message, "CloudFront Function");
    assertStringIncludes(error.message, "for viewer-request");
  });
});
