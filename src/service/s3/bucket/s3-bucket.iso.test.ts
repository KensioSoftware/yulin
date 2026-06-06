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
import { SimS3Bucket } from "./s3-bucket.js";
import { MemoryS3BucketStorage } from "../storage/s3-memory-storage.js";
import { makeTempDir } from "../../../util/filesystem/temp-dir.js";
import { SimS3 } from "../sim-s3.js";
import { Readable } from "node:stream";
import { simS3BodyToBuffer } from "../storage/s3-body-buffer.js";

describe("Simulated S3 Bucket", () => {
  describe.each<StorageFactory>([
    {
      name: "default memory storage",
      makeBucket: () =>
        Promise.resolve(
          new SimS3Bucket(new CreateBucketCommand({ Bucket: "bucket-a" })),
        ),
    },
    {
      name: "filesystem storage",
      makeBucket: async () =>
        new SimS3Bucket(
          new CreateBucketCommand({ Bucket: "bucket-a" }),
          await makeFilesystemStorage(),
        ),
    },
  ])("with $name", ({ makeBucket }) => {
    it("sets the Bucket name", async () => {
      const bucket = await makeBucket();

      assertIdentical(bucket.bucketName, "bucket-a");
    });

    it("puts and gets an Object", async () => {
      const bucket = await makeBucket();
      const body = Buffer.from("Hello, world!");

      await bucket.putObject(new SimS3Object("foo.txt", body));

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

      await Promise.all([
        bucket.putObject(new SimS3Object("foo/a.txt", Buffer.from("a"))),
        bucket.putObject(new SimS3Object("foo/b.txt", Buffer.from("b"))),
        bucket.putObject(new SimS3Object("bar/c.txt", Buffer.from("c"))),
      ]);

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

      await Promise.all([
        bucket.putObject(new SimS3Object("foo/a.txt", Buffer.from("a"))),
        bucket.putObject(new SimS3Object("foo/b.txt", Buffer.from("b"))),
        bucket.putObject(new SimS3Object("bar/c.txt", Buffer.from("c"))),
      ]);

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
    const bucket = new SimS3Bucket(
      new CreateBucketCommand({ Bucket: "bucket-a" }),
    );

    bucket.configureSimStorage(await makeFilesystemStorage());

    await bucket.putObject(new SimS3Object("foo.txt", Buffer.from("foo")));

    const object = await bucket.getObject("foo.txt");

    assertNonNullable(object);
    assertIdentical(object.key, "foo.txt");
    assertBufferEqual(object.body, Buffer.from("foo"));
  });

  it("rejects changing storage implementation after storing Objects", async () => {
    const bucket = new SimS3Bucket(
      new CreateBucketCommand({ Bucket: "bucket-a" }),
    );

    await bucket.putObject(new SimS3Object("foo.txt", Buffer.from("foo")));

    const error = assertThrowsError(() => {
      bucket.configureSimStorage(new MemoryS3BucketStorage());
    });

    assertStringIncludes(
      error.message,
      "Cannot change simulated S3 storage implementation",
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

  return new FilesystemS3BucketStorage(directoryPath);
}
