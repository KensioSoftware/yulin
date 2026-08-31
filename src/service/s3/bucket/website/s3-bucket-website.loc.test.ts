import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";
import { grantPublicObjectRead } from "../sim-s3-public-read.fixture.js";
import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";

describe("Serve simulated S3 Bucket static website on localhost", () => {
  const simAws = new SimAws();

  const srv = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(async () => {
    await srv.close();
  });

  it("does not serve objects before static website hosting is configured", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "website-disabled-site" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "website-disabled-site",
        Key: "index.html",
        Body: "<h1>Hello</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );

    const response = await fetch(
      `http://website-disabled-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/index.html`,
    );

    assertResponseStatus(response, 403, await describeResponse(response));
    assertStringIncludes(
      await response.text(),
      "Static website hosting is not enabled",
    );
  });

  it("serves a configured root index document", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "root-index-site" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "root-index-site",
        Key: "index.html",
        Body: "<h1>Root index</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "root-index-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await grantPublicObjectRead(simS3, "root-index-site");

    const response = await fetch(
      `http://root-index-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/`,
    );

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(await response.text(), "<h1>Root index</h1>");
  });

  it("serves a configured folder index document", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "folder-index-site" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "folder-index-site",
        Key: "docs/index.html",
        Body: "<h1>Docs index</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "folder-index-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await grantPublicObjectRead(simS3, "folder-index-site");

    const response = await fetch(
      `http://folder-index-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs/`,
    );

    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Docs index</h1>");
  });

  it("serves the configured error document body with HTTP 404", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "error-document-site" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "error-document-site",
        Key: "error.html",
        Body: "<h1>Not found</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "error-document-site",
        WebsiteConfiguration: {
          ErrorDocument: {
            Key: "error.html",
          },
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await grantPublicObjectRead(simS3, "error-document-site");

    const response = await fetch(
      `http://error-document-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/missing.html`,
    );

    assertResponseStatus(response, 404, await describeResponse(response));
    assertIdentical(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(await response.text(), "<h1>Not found</h1>");
  });
});
