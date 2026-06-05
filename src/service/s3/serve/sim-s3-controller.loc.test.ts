import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAwsLocalServer } from "../../../serve/http/sim-aws-local-server.js";

describe("Simulated S3 local HTTP controller", () => {
  const srv: SimAwsLocalServer = new SimAwsLocalServer();

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(() => {
    srv.close();
  });

  it("serves an S3 Object body and content type over HTTP GET", async () => {
    const simS3 = srv.simAws.region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));
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

    const res = await fetch(
      `http://foo-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/index.html`,
    );

    assertIdentical(res.status, 200);
    assertIdentical(
      res.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertBufferEqual(
      Buffer.from(await res.arrayBuffer()),
      Buffer.from("<h1>Hello, world!</h1>"),
    );
  });

  it("serves S3 Object headers without a body over HTTP HEAD", async () => {
    const simS3 = srv.simAws.region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "head-site" }));
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

    const res = await fetch(
      `http://head-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/index.html`,
      { method: "HEAD" },
    );

    assertIdentical(res.status, 200);
    assertIdentical(
      res.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assertIdentical(res.headers.get("content-length"), "22");
    assertIdentical(await res.text(), "");
  });

  it("decodes URL-encoded Object keys from the request path", async () => {
    const simS3 = srv.simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "encoded-path-site" }),
    );
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

    const res = await fetch(
      `http://encoded-path-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/folder/hello%20world.txt`,
    );

    assertIdentical(res.status, 200);
    assertIdentical(await res.text(), "Hello from an encoded path");
  });

  it("responds HTTP 501 for S3 Bucket index requests", async () => {
    const simS3 = srv.simAws.region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "index-site" }));

    const res = await fetch(
      `http://index-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/`,
    );

    assertIdentical(res.status, 501);
    const resBody = await res.text();
    assertStringIncludes(resBody, "S3 Bucket indexes are not implemented");
  });

  it("responds HTTP 404 for missing S3 Objects", async () => {
    const simS3 = srv.simAws.region("eu-west-2").s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "missing-object-site" }),
    );

    const res = await fetch(
      `http://missing-object-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/missing.txt`,
    );

    assertIdentical(res.status, 404);
    const resBody = await res.text();
    assertStringIncludes(resBody, "Object not found");
  });

  it("responds HTTP 404 when the hostname region differs from the Bucket region", async () => {
    const simS3 = srv.simAws.region("eu-west-2").s3();

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

    const res = await fetch(
      `http://wrong-region-site.s3-website.us-east-1.sim-aws.localhost:${srv.port}/index.html`,
    );

    assertIdentical(res.status, 404);
    const resBody = await res.text();
    assertStringIncludes(
      resBody,
      "S3 bucket named wrong-region-site is in region eu-west-2, not requested us-east-1",
    );
  });

  it("responds HTTP 405 for unsupported methods", async () => {
    const res = await fetch(
      `http://method-not-allowed-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/index.html`,
      { method: "POST" },
    );

    assertIdentical(res.status, 405);
    const resBody = await res.text();
    assertStringIncludes(resBody, "Method not allowed");
  });
});
