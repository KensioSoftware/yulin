import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { grantPublicObjectRead } from "../../s3/bucket/sim-s3-public-read.fixture.js";
import { SimAwsLocalServer } from "../../../serve/index.js";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { makeAwsRegionName } from "../../aws/sim-aws-region.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

describe("sim CloudFront local server", () => {
  const simAws = new SimAws();

  const srv: SimAwsLocalServer = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(async () => {
    await srv.close();
  });

  it("serves from multiple sim S3 Origins", async () => {
    const simS3 = simAws.s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" }));
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-b" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "assets/foo/object.json",
        Body: jsonStringify({ something: "foo-A" }),
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-a",
        Key: "assets/object.json",
        Body: jsonStringify({ something: "A" }),
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "bucket-b",
        Key: "public/assets/foo/object.json",
        Body: jsonStringify({ something: "foo-B" }),
      }),
    );
    await grantPublicObjectRead(simS3, "bucket-a");
    await grantPublicObjectRead(simS3, "bucket-b");

    const simCloudFront = simAws.cloudFront();
    const distributionCreation = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "default-behavior",
          Comment: "Foobar CDN",
          Enabled: true,
          Origins: {
            Quantity: 2,
            Items: [
              {
                Id: "origin-a",
                DomainName: "bucket-a.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
              {
                Id: "origin-b",
                DomainName: "bucket-b.s3.amazonaws.com",
                OriginPath: "/public",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          CacheBehaviors: {
            Quantity: 2,
            Items: [
              {
                PathPattern: "/assets/*",
                TargetOriginId: "origin-a",
                ViewerProtocolPolicy: "allow-all",
              },
              {
                PathPattern: "/assets/foo/*",
                TargetOriginId: "origin-b",
                ViewerProtocolPolicy: "allow-all",
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin-a",
            ViewerProtocolPolicy: "allow-all",
          },
        },
      }),
    );
    const distroId = distributionCreation.Distribution?.Id;
    assertNonNullable(distroId);

    const assetsResponse = await fetch(
      `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/assets/object.json`,
    );
    assertIdentical(assetsResponse.status, 200);
    assertIdentical(await assetsResponse.text(), '{"something":"A"}');

    const assetsFooResponse = await fetch(
      `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/assets/foo/object.json`,
    );
    assertIdentical(assetsFooResponse.status, 200);
    assertIdentical(await assetsFooResponse.text(), '{"something":"foo-B"}');

    const missingResponse = await fetch(
      `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}/missing/object.json`,
    );
    assertIdentical(missingResponse.status, 404);
  });

  it("serves a static site with a root object and an error page", async () => {
    // Given a site with a home page and an error page in a Bucket.
    const simS3 = simAws.s3();
    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "site-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "site-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: "<h1>Home</h1>",
      }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "site-bucket",
        Key: "404.html",
        ContentType: "text/html",
        Body: "<h1>Not found</h1>",
      }),
    );
    await grantPublicObjectRead(simS3, "site-bucket");

    // And a Distribution serving it the way a static site is usually set up.
    const distributionCreation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "static-site",
          Comment: "Static site CDN",
          Enabled: true,
          DefaultRootObject: "index.html",
          CustomErrorResponses: {
            Quantity: 2,
            Items: [
              {
                ErrorCode: 404,
                ResponsePagePath: "/404.html",
                ResponseCode: "404",
              },
              {
                ErrorCode: 403,
                ResponsePagePath: "/404.html",
                ResponseCode: "404",
              },
            ],
          },
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "site-origin",
                DomainName: "site-bucket.s3.amazonaws.com",
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
    const distroId = distributionCreation.Distribution?.Id;
    assertNonNullable(distroId);
    const siteUrl = `http://${distroId.toLowerCase()}.cloudfront.net.sim-aws.localhost:${srv.port}`;

    // When the site root is requested over localhost.
    const homeResponse = await fetch(`${siteUrl}/`);

    // Then the home page is served.
    assertIdentical(homeResponse.status, 200);
    assertIdentical(await homeResponse.text(), "<h1>Home</h1>");

    // And when a page that does not exist is requested.
    const missingResponse = await fetch(`${siteUrl}/nowhere`);

    // Then the site's own error page is served, not the simulator's.
    assertIdentical(missingResponse.status, 404);
    assertIdentical(await missingResponse.text(), "<h1>Not found</h1>");
  });

  it("can use S3 Origin in any Region", async () => {
    const regionA = makeAwsRegionName();
    const regionB = makeAwsRegionName();

    const simS3 = simAws.region(regionA).s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-bucket" }));
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "foo-bucket",
        Key: "assets/foo/object.json",
        Body: jsonStringify({ something: "foobar" }),
      }),
    );
    await grantPublicObjectRead(simS3, "foo-bucket");

    const simCloudFront = simAws.region(regionB).cloudFront();
    const distributionCreation = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "default-behavior",
          Comment: "Foobar CDN",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "foo-origin",
                DomainName: "foo-bucket.s3.amazonaws.com",
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "foo-origin",
            ViewerProtocolPolicy: "allow-all",
          },
        },
      }),
    );
    const distroId = distributionCreation.Distribution?.Id;
    assertNonNullable(distroId);
  });

  it("throws when Bucket for S3 Origin does not exist", async () => {
    const simCloudFront = simAws.region(makeAwsRegionName()).cloudFront();

    const error = await assertThrowsErrorAsync(async () => {
      await simCloudFront.createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "default-behavior",
            Comment: "Foobar CDN",
            Enabled: true,
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "foo-origin",
                  DomainName: "missing-bucket.s3.amazonaws.com",
                  S3OriginConfig: { OriginAccessIdentity: "" },
                },
              ],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "foo-origin",
              ViewerProtocolPolicy: "allow-all",
            },
          },
        }),
      );
    });

    assertStringIncludes(
      error.message,
      "Unable to find sim S3 Bucket missing-bucket for sim CloudFront S3 Origin",
    );
  });
});
