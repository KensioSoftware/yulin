import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";

describe("Serve simulated S3 Bucket static website on localhost", () => {
  const simAws = new SimAws();

  const srv = new SimAwsLocalServer(simAws);

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(() => {
    srv.close();
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

    const res = await fetch(
      `http://website-disabled-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/index.html`,
    );

    assertIdentical(res.status, 403);
    assertStringIncludes(
      await res.text(),
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

    const res = await fetch(
      `http://root-index-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/`,
    );

    assertIdentical(res.status, 200);
    assertIdentical(
      res.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(await res.text(), "<h1>Root index</h1>");
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

    const res = await fetch(
      `http://folder-index-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs/`,
    );

    assertIdentical(res.status, 200);
    assertIdentical(await res.text(), "<h1>Docs index</h1>");
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

    const res = await fetch(
      `http://folder-index-redirect-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs`,
      { redirect: "manual" },
    );

    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      `http://folder-index-redirect-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs/`,
    );
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

    const res = await fetch(
      `http://error-document-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/missing.html`,
    );

    assertIdentical(res.status, 404);
    assertIdentical(
      res.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(await res.text(), "<h1>Not found</h1>");
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

    const res = await fetch(
      `http://missing-redirect-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/missing.html`,
      { redirect: "manual" },
    );

    assertIdentical(res.status, 302);
    assertIdentical(
      res.headers.get("location"),
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

    const res = await fetch(
      `http://index-before-rule-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs/`,
      { redirect: "manual" },
    );

    assertIdentical(res.status, 200);
    assertIdentical(res.headers.get("location"), null);
    assertIdentical(await res.text(), "<h1>Docs index</h1>");
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
            HostName: "example.com",
            Protocol: "https",
          },
        },
      }),
    );

    const res = await fetch(
      `http://redirect-all-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs/page.html`,
      { redirect: "manual" },
    );

    assertIdentical(res.status, 301);
    assertIdentical(
      res.headers.get("location"),
      "https://example.com/docs/page.html",
    );
  });
});
