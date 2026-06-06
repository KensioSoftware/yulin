import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAwsLocalServer } from "../../../serve/index.js";
import { makeTempDir } from "../../../util/filesystem/temp-dir.js";
import * as fs from "node:fs/promises";
import path from "node:path";
import {
  CreateBucketCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import type { SimS3BucketName } from "../bucket/sim-s3-bucket.js";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { FilesystemS3BucketStorage } from "./s3-filesystem-storage.js";
import { makeAwsRegionName } from "../../aws/sim-aws-region.js";
import { SimAws } from "../../aws/sim-aws.js";
import { installSimS3 } from "../install/install-sim-s3.js";

describe("Serve sim S3 Bucket on localhost with filesystem storage", () => {
  const simAws = new SimAws();
  installSimS3(simAws);
  const srv: SimAwsLocalServer = new SimAwsLocalServer(simAws);

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(() => {
    srv.close();
  });

  it("reads files from filesystem and serves on localhost", async () => {
    const directoryPath = await makeTempDir();
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.writeFile(
      path.join(directoryPath, "foobar.html"),
      "<h1>Hello</h1>",
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.writeFile(
      path.join(directoryPath, "index.html"),
      "<h1>Filesystem index</h1>",
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.writeFile(
      path.join(directoryPath, "error.html"),
      "<h1>Not found on filesystem</h1>",
    );

    const region = makeAwsRegionName();
    const bucketName = "foo-site" as SimS3BucketName;
    const simS3 = simAws.region(region).service("s3");
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
    simBucket.configureSimStorage(new FilesystemS3BucketStorage(directoryPath));

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
});
