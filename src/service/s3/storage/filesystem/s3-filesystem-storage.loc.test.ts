import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAwsLocalServer } from "../../../../serve/index.js";
import { TemporaryDirectory as TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import type { SimS3BucketName } from "../../bucket/sim-s3-bucket.js";
import {
  assertIdentical,
  assertNonNullable,
  assertStringEndsWith,
} from "@kensio/smartass";
import { FilesystemS3BucketStorage } from "./s3-filesystem-storage.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimAws } from "../../../aws/sim-aws.js";

describe("Serve sim S3 Bucket on localhost with filesystem storage", () => {
  const simAws = new SimAws();

  const srv: SimAwsLocalServer = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(() => {
    srv.close();
  });

  it("reads files from filesystem and serves on localhost", async () => {
    const testDir = new TemporaryDirectory();
    await testDir.writeFile("public/foobar.html", "<h1>Hello</h1>");
    await testDir.writeFile("public/index.html", "<h1>Filesystem index</h1>");
    await testDir.writeFile(
      "public/error.html",
      "<h1>Not found on filesystem</h1>",
    );

    const region = makeAwsRegionName();
    const bucketName = "foo-site" as SimS3BucketName;
    const simS3 = simAws.region(region).s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: bucketName,
        WebsiteConfiguration: {
          IndexDocument: { Suffix: "index.html" },
          ErrorDocument: { Key: "error.html" },
        },
      }),
    );

    const simBucket = simS3.getSimBucketByName(bucketName);
    assertNonNullable(simBucket);
    simBucket.configureSimStorage(
      new FilesystemS3BucketStorage({
        directoryPath: testDir.join("public"),
      }),
    );

    const okRes = await fetch(
      `http://foo-site.s3-website.${region}.sim-aws.localhost:${srv.port}/foobar.html`,
    );
    assertIdentical(okRes.status, 200);
    assertIdentical(okRes.headers.get("content-type"), "text/html");
    assertIdentical(await okRes.text(), "<h1>Hello</h1>");

    const indexRes = await fetch(
      `http://foo-site.s3-website.${region}.sim-aws.localhost:${srv.port}/`,
    );
    assertIdentical(indexRes.status, 200);
    assertIdentical(indexRes.headers.get("content-type"), "text/html");
    assertIdentical(await indexRes.text(), "<h1>Filesystem index</h1>");

    const notFoundRes = await fetch(
      `http://foo-site.s3-website.${region}.sim-aws.localhost:${srv.port}/does-not-exist.json`,
    );
    assertIdentical(notFoundRes.status, 404);
    assertIdentical(notFoundRes.headers.get("content-type"), "text/html");
    assertIdentical(
      await notFoundRes.text(),
      "<h1>Not found on filesystem</h1>",
    );
  });

  it("redirects extensionless filesystem folder paths to a trailing slash when an index document exists", async () => {
    const testDir = new TemporaryDirectory();
    await testDir.writeFile(
      ["public", "dengji", "a1", "index.html"],
      "<h1>A1 index</h1>",
    );

    const region = makeAwsRegionName();
    const bucketName = "folder-index-filesystem-site" as SimS3BucketName;
    const simS3 = simAws.region(region).s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: bucketName,
        WebsiteConfiguration: {
          IndexDocument: { Suffix: "index.html" },
        },
      }),
    );

    const simBucket = simS3.getSimBucketByName(bucketName);
    assertNonNullable(simBucket);
    simBucket.configureSimStorage(
      new FilesystemS3BucketStorage({ directoryPath: testDir.join("public") }),
    );

    const redirectRes = await fetch(
      `http://folder-index-filesystem-site.s3-website.${region}.sim-aws.localhost:${srv.port}/dengji/a1`,
      { redirect: "manual" },
    );

    assertIdentical(redirectRes.status, 301);
    assertIdentical(
      redirectRes.headers.get("location"),
      `http://folder-index-filesystem-site.s3-website.${region}.sim-aws.localhost:${srv.port}/dengji/a1/`,
    );

    const indexRes = await fetch(
      `http://folder-index-filesystem-site.s3-website.${region}.sim-aws.localhost:${srv.port}/dengji/a1`,
    );

    assertIdentical(indexRes.status, 200);
    assertStringEndsWith(indexRes.url, "/dengji/a1/");
    assertIdentical(indexRes.headers.get("content-type"), "text/html");
    assertIdentical(await indexRes.text(), "<h1>A1 index</h1>");
  });
});
