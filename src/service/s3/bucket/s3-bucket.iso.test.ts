import { CreateBucketCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { SimS3Object } from "../object/s3-object.js";
import { FilesystemS3BucketStorage } from "../storage/s3-filesystem-storage.js";
import { SimS3Bucket } from "./sim-s3-bucket.js";
import { MemoryS3BucketStorage } from "../storage/s3-memory-storage.js";
import { makeTempDir } from "../../../util/filesystem/temp-dir.js";
import { SimS3 } from "../sim-s3.js";
import { Readable } from "node:stream";
import { simS3BodyToBuffer } from "../storage/s3-body-buffer.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.js";
import { S3BucketWebsite } from "./website/s3-bucket-website.js";

describe("Simulated S3 Bucket", () => {
  describe.each<StorageFactory>([
    {
      name: "default memory storage",
      makeBucket: () =>
        Promise.resolve(new SimS3Bucket({ bucketName: "bucket-a" })),
    },
    {
      name: "filesystem storage",
      makeBucket: async () =>
        new SimS3Bucket({
          bucketName: "bucket-a",
          storage: await makeFilesystemStorage(),
        }),
    },
  ])("with $name", ({ makeBucket }) => {
    it("sets the Bucket name", async () => {
      const bucket = await makeBucket();

      assertIdentical(bucket.bucketName, "bucket-a");
    });

    it("puts and gets an Object", async () => {
      const bucket = await makeBucket();
      const body = Buffer.from("Hello, world!");

      await bucket.putObject(new SimS3Object({ key: "foo.txt", body }));

      const object = await bucket.getObject("foo.txt");

      assertNonNullable(object);
      assertIdentical(object.key, "foo.txt");
      assertBufferEqual(object.body, body);
    });

    it("gets undefined for missing Object", async () => {
      const bucket = await makeBucket();

      const object = await bucket.getObject("missing.txt");

      assertUndefined(object);
    });

    it("lists Objects", async () => {
      const bucket = await makeBucket();

      await bucket.putObject(
        new SimS3Object({
          key: "foo/a.txt",
          body: Buffer.from("a"),
        }),
      );
      await bucket.putObject(
        new SimS3Object({
          key: "foo/b.txt",
          body: Buffer.from("b"),
        }),
      );
      await bucket.putObject(
        new SimS3Object({
          key: "bar/c.txt",
          body: Buffer.from("c"),
        }),
      );

      const objects = await bucket.listObjects();
      const keys = objects
        .map((object) => object.key)
        .toSorted((a, b) => a.localeCompare(b));

      assertArrayLength(keys, 3);
      assertIdentical(keys[0], "bar/c.txt");
      assertIdentical(keys[1], "foo/a.txt");
      assertIdentical(keys[2], "foo/b.txt");
    });

    it("lists Objects with prefix", async () => {
      const bucket = await makeBucket();

      await bucket.putObject(
        new SimS3Object({
          key: "foo/a.txt",
          body: Buffer.from("a"),
        }),
      );
      await bucket.putObject(
        new SimS3Object({
          key: "foo/b.txt",
          body: Buffer.from("b"),
        }),
      );
      await bucket.putObject(
        new SimS3Object({
          key: "bar/c.txt",
          body: Buffer.from("c"),
        }),
      );

      const objects = await bucket.listObjects("foo/");
      const keys = objects
        .map((object) => object.key)
        .toSorted((a, b) => a.localeCompare(b));

      assertArrayLength(keys, 2);
      assertIdentical(keys[0], "foo/a.txt");
      assertIdentical(keys[1], "foo/b.txt");
    });
  });

  it("changes storage implementation before storing Objects", async () => {
    const bucket = new SimS3Bucket({ bucketName: "bucket-a" });

    bucket.configureSimStorage(await makeFilesystemStorage());

    await bucket.putObject(
      new SimS3Object({ key: "foo.txt", body: Buffer.from("foo") }),
    );

    const object = await bucket.getObject("foo.txt");

    assertNonNullable(object);
    assertIdentical(object.key, "foo.txt");
    assertBufferEqual(object.body, Buffer.from("foo"));
  });

  it("rejects changing storage implementation after storing Objects", async () => {
    const bucket = new SimS3Bucket({ bucketName: "bucket-a" });

    await bucket.putObject(
      new SimS3Object({ key: "foo.txt", body: Buffer.from("foo") }),
    );

    const error = assertThrowsError(() => {
      bucket.configureSimStorage(new MemoryS3BucketStorage());
    });

    assertStringIncludes(
      error.message,
      "Cannot change simulated S3 storage implementation",
    );
  });

  it("gets a static website URL", () => {
    const bucket = new SimS3Bucket({
      bucketName: "bucket-a",
      accountRegionScope: simAwsAccountRegionScopeFactory.make({
        regionName: "eu-west-2",
      }),
      website: new S3BucketWebsite({
        IndexDocument: {
          Suffix: "index.html",
        },
      }),
    });

    const url = bucket.getWebsiteUrl();

    assertIdentical(
      url.toString(),
      "http://bucket-a.s3-website.eu-west-2.sim-aws.localhost/",
    );
  });

  it("throws when getting a static website URL before website hosting is enabled", () => {
    const bucket = new SimS3Bucket({ bucketName: "bucket-a" });

    const error = assertThrowsError(() => {
      bucket.getWebsiteUrl();
    });

    assertStringIncludes(
      error.message,
      "Static website hosting is not enabled for sim S3 Bucket bucket-a",
    );
  });

  it("gets a static website URL after configuring website hosting", () => {
    const bucket = new SimS3Bucket({
      bucketName: "bucket-a",
      accountRegionScope: simAwsAccountRegionScopeFactory.make({
        regionName: "ap-southeast-2",
      }),
    });

    bucket.configureWebsite(
      new S3BucketWebsite({
        ErrorDocument: {
          Key: "error.html",
        },
      }),
    );

    const url = bucket.getWebsiteUrl();

    assertIdentical(
      url.toString(),
      "http://bucket-a.s3-website.ap-southeast-2.sim-aws.localhost/",
    );
  });

  it("sets up filesystem storage using mountBucketFilesystem util method", async () => {
    const simS3 = new SimS3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "foobar" }));

    const directoryPath = await makeTempDir();
    simS3.mountBucketFilesystem("foobar", directoryPath);

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(path.join(directoryPath, "hello.txt"), "hello!");

    const getObject = await simS3.getObject(
      new GetObjectCommand({ Bucket: "foobar", Key: "hello.txt" }),
    );

    assertInstanceOf(getObject.Body, Readable);
    assertBufferEqual(
      await simS3BodyToBuffer(getObject.Body),
      Buffer.from("hello!"),
    );
  });
});

interface StorageFactory {
  readonly name: string;
  readonly makeBucket: () => Promise<SimS3Bucket>;
}

async function makeFilesystemStorage(): Promise<FilesystemS3BucketStorage> {
  const tempRootPath = await mkdtemp(path.join(tmpdir(), "yulin-s3-test-"));
  const directoryPath = path.join(tempRootPath, "public");

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await mkdir(directoryPath);

  return new FilesystemS3BucketStorage({ directoryPath });
}
