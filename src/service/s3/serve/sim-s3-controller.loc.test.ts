import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertStringEndsWith,
  assertStringIncludes,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";
import { grantPublicWebsiteRead } from "../bucket/website/sim-s3-public-website.fixture.js";
import { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("Simulated S3 local HTTP controller", () => {
  const simAws = new SimAws();

  const srv: SimAwsLocalServer = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(() => {
    srv.close();
  });

  it("serves an S3 Object body and content type over HTTP GET", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "foo-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await grantPublicWebsiteRead(simS3, "foo-site");
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "foo-site",
        Key: "index.html",
        Body: "<h1>Hello, world!</h1>",
        Metadata: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );

    const response = await fetch(
      `http://foo-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/index.html`,
    );

    assertIdentical(response.status, 200);
    assertIdentical(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertBufferEqual(
      Buffer.from(await response.arrayBuffer()),
      Buffer.from("<h1>Hello, world!</h1>"),
    );
  });

  it("serves S3 Object headers without a body over HTTP HEAD", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "head-site" }));
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "head-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await grantPublicWebsiteRead(simS3, "head-site");
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "head-site",
        Key: "index.html",
        Body: "<h1>Hello, world!</h1>",
        Metadata: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );

    const response = await fetch(
      `http://head-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/index.html`,
      { method: "HEAD" },
    );

    assertIdentical(response.status, 200);
    assertIdentical(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(response.headers.get("content-length"), "22");
    assertIdentical(await response.text(), "");
  });

  it("decodes URL-encoded Object keys from the request path", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "encoded-path-site" }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "encoded-path-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await grantPublicWebsiteRead(simS3, "encoded-path-site");
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "encoded-path-site",
        Key: "folder/hello world.txt",
        Body: "Hello from an encoded path",
        Metadata: {
          "content-type": "text/plain; charset=utf-8",
        },
      }),
    );

    const response = await fetch(
      `http://encoded-path-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/folder/hello%20world.txt`,
    );

    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "Hello from an encoded path");
  });

  it("redirects folder requests without a trailing slash when an index document exists", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "folder-index-redirect-site" }),
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
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "folder-index-redirect-site",
        Key: "docs/index.html",
        Body: "<h1>Docs index</h1>",
        Metadata: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );

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

  it("serves the folder index document after following the trailing slash redirect", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "folder-index-follow-site" }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "folder-index-follow-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await grantPublicWebsiteRead(simS3, "folder-index-follow-site");
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "folder-index-follow-site",
        Key: "docs/index.html",
        Body: "<h1>Docs index after redirect</h1>",
        Metadata: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );

    const response = await fetch(
      `http://folder-index-follow-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/docs`,
    );

    assertIdentical(response.status, 200);
    assertStringEndsWith(response.url, "/docs/");
    assertIdentical(
      response.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(
      await response.text(),
      "<h1>Docs index after redirect</h1>",
    );
  });

  it("does not serve S3 Bucket root requests when static website hosting is not enabled", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "index-site" }));

    const response = await fetch(
      `http://index-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/`,
    );

    assertIdentical(response.status, 403);
    const responseBody = await response.text();
    assertStringIncludes(responseBody, "Static website hosting is not enabled");
  });

  it("responds HTTP 404 for missing S3 Objects when static website hosting is enabled", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "missing-object-site" }),
    );
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: "missing-object-site",
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: "index.html",
          },
        },
      }),
    );
    await grantPublicWebsiteRead(simS3, "missing-object-site");

    const response = await fetch(
      `http://missing-object-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/missing.txt`,
    );

    assertIdentical(response.status, 404);
    const responseBody = await response.text();
    assertStringIncludes(responseBody, "Object missing.txt not found");
  });

  it("responds HTTP 404 when the hostname region differs from the Bucket region", async () => {
    const simS3 = simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "wrong-region-site" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "wrong-region-site",
        Key: "index.html",
        Body: "Hello from the Bucket region",
      }),
    );

    const response = await fetch(
      `http://wrong-region-site.s3-website.us-east-1.sim-aws.localhost:${srv.port}/index.html`,
    );

    assertIdentical(response.status, 404);
    const responseBody = await response.text();
    assertStringIncludes(
      responseBody,
      "S3 bucket named wrong-region-site is in region eu-west-2, not requested us-east-1",
    );
  });

  it("responds HTTP 405 for unsupported methods", async () => {
    const response = await fetch(
      `http://method-not-allowed-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/index.html`,
      { method: "POST" },
    );

    assertIdentical(response.status, 405);
    const responseBody = await response.text();
    assertStringIncludes(responseBody, "Method not allowed");
  });
});
