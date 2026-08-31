import { afterAll, beforeAll, describe, it } from "vitest";
import { grantPublicObjectRead } from "../../bucket/sim-s3-public-read.fixture.js";
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
  assertResponseStatus,
  assertStringEndsWith,
  describeResponse,
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

  afterAll(async () => {
    await srv.close();
  });

  it("reads files from filesystem and serves on localhost", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.writeFile("public/foobar.html", "<h1>Hello</h1>");
    await testDirectory.writeFile(
      "public/index.html",
      "<h1>Filesystem index</h1>",
    );
    await testDirectory.writeFile(
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
    await grantPublicObjectRead(simS3, bucketName);

    const simBucket = simS3.getSimBucketByName(bucketName);
    assertNonNullable(simBucket);
    simBucket.configureSimStorage(
      new FilesystemS3BucketStorage({
        directoryPath: testDirectory.join("public"),
      }),
    );

    const okResponse = await fetch(
      `http://foo-site.s3-website.${region}.sim-aws.localhost:${srv.port}/foobar.html`,
    );
    assertResponseStatus(okResponse, 200, await describeResponse(okResponse));
    assertIdentical(okResponse.headers.get("content-type"), "text/html");
    assertIdentical(await okResponse.text(), "<h1>Hello</h1>");

    const indexResponse = await fetch(
      `http://foo-site.s3-website.${region}.sim-aws.localhost:${srv.port}/`,
    );
    assertResponseStatus(
      indexResponse,
      200,
      await describeResponse(indexResponse),
    );
    assertIdentical(indexResponse.headers.get("content-type"), "text/html");
    assertIdentical(await indexResponse.text(), "<h1>Filesystem index</h1>");

    const notFoundResponse = await fetch(
      `http://foo-site.s3-website.${region}.sim-aws.localhost:${srv.port}/does-not-exist.json`,
    );
    assertResponseStatus(
      notFoundResponse,
      404,
      await describeResponse(notFoundResponse),
    );
    assertIdentical(notFoundResponse.headers.get("content-type"), "text/html");
    assertIdentical(
      await notFoundResponse.text(),
      "<h1>Not found on filesystem</h1>",
    );
  });

  it("redirects extensionless filesystem folder paths to a trailing slash when an index document exists", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.writeFile(
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
    await grantPublicObjectRead(simS3, bucketName);

    const simBucket = simS3.getSimBucketByName(bucketName);
    assertNonNullable(simBucket);
    simBucket.configureSimStorage(
      new FilesystemS3BucketStorage({
        directoryPath: testDirectory.join("public"),
      }),
    );

    const redirectResponse = await fetch(
      `http://folder-index-filesystem-site.s3-website.${region}.sim-aws.localhost:${srv.port}/dengji/a1`,
      { redirect: "manual" },
    );

    assertResponseStatus(
      redirectResponse,
      301,
      await describeResponse(redirectResponse),
    );
    assertIdentical(
      redirectResponse.headers.get("location"),
      `http://folder-index-filesystem-site.s3-website.${region}.sim-aws.localhost:${srv.port}/dengji/a1/`,
    );

    const indexResponse = await fetch(
      `http://folder-index-filesystem-site.s3-website.${region}.sim-aws.localhost:${srv.port}/dengji/a1`,
    );

    assertResponseStatus(
      indexResponse,
      200,
      await describeResponse(indexResponse),
    );
    assertStringEndsWith(indexResponse.url, "/dengji/a1/");
    assertIdentical(indexResponse.headers.get("content-type"), "text/html");
    assertIdentical(await indexResponse.text(), "<h1>A1 index</h1>");
  });
});
