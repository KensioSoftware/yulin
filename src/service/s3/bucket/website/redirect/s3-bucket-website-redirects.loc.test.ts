import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { assertIdentical } from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";
import { grantPublicWebsiteRead } from "../sim-s3-public-website.fixture.js";
import { SimAwsLocalServer } from "../../../../../serve/index.js";
import { SimAws } from "../../../../aws/sim-aws.js";

describe("Serve simulated S3 Bucket static website on localhost", () => {
  const simAws = new SimAws();

  const srv = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(() => {
    srv.close();
  });

  it("redirects to a slash-terminated folder URL when a folder index document exists", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "folder-index-redirect-site" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "folder-index-redirect-site",
        Key: "docs/index.html",
        Body: "<h1>Docs index</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "folder-index-redirect-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await grantPublicWebsiteRead(simS3, "folder-index-redirect-site");

    const response = await fetch(
      `http://folder-index-redirect-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs`,
      { redirect: "manual" },
    );

    assertIdentical(response.status, 301);
    assertIdentical(
      response.headers.get("location"),
      `http://folder-index-redirect-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs/`,
    );
  });

  it("redirects missing objects with a matching HTTP error routing rule", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "missing-redirect-site" }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "missing-redirect-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
          RoutingRules: [
            {
              Condition: {
                HttpErrorCodeReturnedEquals: "404",
              },
              Redirect: {
                HttpRedirectCode: "302",
                ReplaceKeyWith: "not-found.html",
              },
            },
          ],
        },
      }),
    );
    await grantPublicWebsiteRead(simS3, "missing-redirect-site");

    const response = await fetch(
      `http://missing-redirect-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/missing.html`,
      { redirect: "manual" },
    );

    assertIdentical(response.status, 302);
    assertIdentical(
      response.headers.get("location"),
      `http://missing-redirect-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/not-found.html`,
    );
  });

  it("resolves an index document before checking HTTP error routing rules", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "index-before-rule-site" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "index-before-rule-site",
        Key: "docs/index.html",
        Body: "<h1>Docs index</h1>",
        ContentType: "text/html; charset=utf-8",
      }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "index-before-rule-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
          RoutingRules: [
            {
              Condition: {
                HttpErrorCodeReturnedEquals: "404",
              },
              Redirect: {
                ReplaceKeyWith: "not-found.html",
              },
            },
          ],
        },
      }),
    );
    await grantPublicWebsiteRead(simS3, "index-before-rule-site");

    const response = await fetch(
      `http://index-before-rule-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs/`,
      { redirect: "manual" },
    );

    assertIdentical(response.status, 200);
    assertIdentical(response.headers.get("location"), null);
    assertIdentical(await response.text(), "<h1>Docs index</h1>");
  });

  it("redirects all requests when RedirectAllRequestsTo is configured", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "redirect-all-site" }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "redirect-all-site",
        WebsiteConfiguration: {
          RedirectAllRequestsTo: {
            HostName: "example.test",
            Protocol: "https",
          },
        },
      }),
    );
    await grantPublicWebsiteRead(simS3, "redirect-all-site");

    const response = await fetch(
      `http://redirect-all-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs/page.html`,
      { redirect: "manual" },
    );

    assertIdentical(response.status, 301);
    assertIdentical(
      response.headers.get("location"),
      "https://example.test/docs/page.html",
    );
  });
});
