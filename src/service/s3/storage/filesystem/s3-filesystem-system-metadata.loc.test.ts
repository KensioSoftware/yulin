import { brotliCompressSync } from "node:zlib";

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutBucketWebsiteCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertObjectMatches,
  assertUndefined,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimS3BucketName } from "../../bucket/sim-s3-bucket.js";
import { grantPublicWebsiteRead } from "../../bucket/website/sim-s3-public-website.fixture.js";

/**
 * A site publishing a compressed mirror of its assets, which is what the
 * declaration exists for. The mirrored copies keep their names, so nothing
 * about `br/js/app.js` says it is brotli except the mount saying so.
 */
const compressedMirror = [
  { keyPrefix: "br/", metadata: { ContentEncoding: "br" } },
] as const;

describe("System metadata declared for a mounted directory", () => {
  const simAws = new SimAws();
  const srv: SimAwsLocalServer = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(async () => {
    await srv.close();
  });

  it("reports the metadata declared for the Objects under a prefix", async () => {
    // Given a site with a brotli mirror of one of its scripts.
    const testDirectory = new TemporaryDirectory();
    await testDirectory.writeFile(["public", "js", "app.js"], "console.log(1)");
    await testDirectory.writeFile(
      ["public", "br", "js", "app.js"],
      brotliCompressSync(Buffer.from("console.log(1)")),
    );

    const simS3 = simAws.region(makeAwsRegionName()).s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "mirror" }));

    // When the directory is mounted, saying what is under the mirror.
    simS3.mountBucketFilesystem("mirror", testDirectory.join("public"), {
      systemMetadata: compressedMirror,
    });

    const mirrored = await simS3.getObject(
      new GetObjectCommand({ Bucket: "mirror", Key: "br/js/app.js" }),
    );
    const plain = await simS3.getObject(
      new GetObjectCommand({ Bucket: "mirror", Key: "js/app.js" }),
    );

    // Then the mirrored copy is brotli, still typed by its own extension.
    assertObjectMatches(mirrored.Metadata, {
      "content-encoding": "br",
      "content-type": "text/javascript",
    });

    // And the copy outside the mirror is left as it is on disk.
    assertUndefined(plain.Metadata?.["content-encoding"]);
    assertIdentical(plain.Metadata?.["content-type"], "text/javascript");
  });

  it("serves a mounted mirror as bytes a client can decode", async () => {
    // Given the same mirror, served as a static website.
    const testDirectory = new TemporaryDirectory();
    await testDirectory.writeFile(
      ["public", "br", "js", "app.js"],
      brotliCompressSync(Buffer.from("console.log('decoded')")),
    );

    const region = makeAwsRegionName();
    const bucketName = "mirror-site" as SimS3BucketName;
    const simS3 = simAws.region(region).s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simS3.putBucketWebsite(
      new PutBucketWebsiteCommand({
        Bucket: bucketName,
        WebsiteConfiguration: { IndexDocument: { Suffix: "index.html" } },
      }),
    );
    await grantPublicWebsiteRead(simS3, bucketName);

    simS3.mountBucketFilesystem(bucketName, testDirectory.join("public"), {
      systemMetadata: compressedMirror,
    });

    // When a client asks for the mirrored copy.
    const response = await fetch(
      `http://${bucketName}.s3-website.${region}.sim-aws.localhost:${srv.port}/br/js/app.js`,
    );

    // Then it arrives labelled as brotli, and decodes to the original script.
    // Without the header these are bytes the client hands back unread.
    assertIdentical(response.headers.get("content-encoding"), "br");
    assertIdentical(response.headers.get("content-type"), "text/javascript");
    assertIdentical(await response.text(), "console.log('decoded')");
  });
});
