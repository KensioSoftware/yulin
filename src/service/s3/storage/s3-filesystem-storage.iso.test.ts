import { describe, it } from "vitest";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  assertArrayLength,
  assertBufferEqual,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { FilesystemS3BucketStorage } from "./s3-filesystem-storage.js";
import { SimS3Object } from "../object/s3-object.js";
import { makeTempDir } from "../../../util/filesystem/temp-dir.js";

describe("Filesystem simulated S3 storage", () => {
  it("puts and gets an Object from the filesystem", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage(directoryPath);

    const body = Buffer.from("Hello, world!");

    await storage.putObject(new SimS3Object("foo.txt", body));

    const object = await storage.getObject("foo.txt");

    assertNonNullable(object);
    assertIdentical(object.key, "foo.txt");
    assertBufferEqual(object.body, body);
  });

  it("gets undefined for missing Object", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage(directoryPath);

    const object = await storage.getObject("missing.txt");

    assertUndefined(object);
  });

  it("lists no Objects when storage directory does not exist", async () => {
    const tempRootPath = await mkdtemp(path.join(tmpdir(), "yulin-s3-test-"));
    const directoryPath = path.join(tempRootPath, "public");

    const storage = new FilesystemS3BucketStorage(directoryPath);
    const objects = await storage.listObjects();

    assertArrayLength(objects, 0);
  });

  it("does not allow changing storage implementation", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage(directoryPath);

    assertFalse(storage.allowChangeStorage());
  });

  it("lists Objects from the filesystem", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage(directoryPath);

    await Promise.all([
      storage.putObject(new SimS3Object("foo/a.txt", Buffer.from("a"))),
      storage.putObject(new SimS3Object("foo/b.txt", Buffer.from("b"))),
      storage.putObject(new SimS3Object("bar/c.txt", Buffer.from("c"))),
    ]);

    const objects = await storage.listObjects();
    const keys = objects
      .map((object) => object.key)
      .toSorted((a, b) => a.localeCompare(b));

    assertArrayLength(keys, 3);
    assertIdentical(keys[0], "bar/c.txt");
    assertIdentical(keys[1], "foo/a.txt");
    assertIdentical(keys[2], "foo/b.txt");
  });

  it("lists Objects with prefix", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage(directoryPath);

    await Promise.all([
      storage.putObject(new SimS3Object("foo/a.txt", Buffer.from("a"))),
      storage.putObject(new SimS3Object("foo/b.txt", Buffer.from("b"))),
      storage.putObject(new SimS3Object("bar/c.txt", Buffer.from("c"))),
    ]);

    const objects = await storage.listObjects("foo/");
    const keys = objects
      .map((object) => object.key)
      .toSorted((a, b) => a.localeCompare(b));

    assertArrayLength(keys, 2);
    assertIdentical(keys[0], "foo/a.txt");
    assertIdentical(keys[1], "foo/b.txt");
  });

  it("makes up reasonable Object metadata from file extension", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage(directoryPath);

    await storage.putObject(
      new SimS3Object("index.html", Buffer.from("<h1>Hello</h1>")),
    );

    const object = await storage.getObject("index.html");

    assertNonNullable(object);
    assertIdentical(object.metadata.values["content-type"], "text/html");
  });

  it.each([
    ["style.css", "text/css"],
    ["image.gif", "image/gif"],
    ["page.htm", "text/html"],
    ["favicon.ico", "image/x-icon"],
    ["photo.jpeg", "image/jpeg"],
    ["photo.jpg", "image/jpeg"],
    ["script.js", "text/javascript"],
    ["module.mjs", "text/javascript"],
    ["data.json", "application/json"],
    ["bundle.map", "application/json"],
    ["image.png", "image/png"],
    ["image.svg", "image/svg+xml"],
    ["note.txt", "text/plain"],
    ["image.webp", "image/webp"],
    ["feed.xml", "application/xml"],
  ])("makes up %s Object content type metadata", async (key, contentType) => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage(directoryPath);

    await storage.putObject(new SimS3Object(key, Buffer.from(key)));

    const object = await storage.getObject(key);

    assertNonNullable(object);
    assertIdentical(object.metadata.values["content-type"], contentType);
  });

  it("ignores unsupported file extensions when listing Objects", async () => {
    const directoryPath = await makeTempDir();

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(path.join(directoryPath, "safe.txt"), "safe");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(path.join(directoryPath, "unsafe.pem"), "unsafe");

    const storage = new FilesystemS3BucketStorage(directoryPath);
    const objects = await storage.listObjects();

    assertArrayLength(objects, 1);
    assertIdentical(objects[0].key, "safe.txt");
  });

  it("ignores symlinks when listing Objects", async () => {
    const tempRootPath = await mkdtemp(path.join(tmpdir(), "yulin-s3-test-"));
    const directoryPath = path.join(tempRootPath, "public");

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(directoryPath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(path.join(directoryPath, "safe.txt"), "safe");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(path.join(tempRootPath, "outside.txt"), "outside");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await symlink(
      path.join(tempRootPath, "outside.txt"),
      path.join(directoryPath, "linked.txt"),
    );

    const storage = new FilesystemS3BucketStorage(directoryPath);
    const objects = await storage.listObjects();

    assertArrayLength(objects, 1);
    assertIdentical(objects[0].key, "safe.txt");
  });

  it("rejects relative storage directory path", () => {
    const error = assertThrowsError(
      () => new FilesystemS3BucketStorage("public"),
    );

    assertStringIncludes(error.message, "must be absolute");
  });

  it("rejects storage directory filesystem root", () => {
    const error = assertThrowsError(
      () => new FilesystemS3BucketStorage(path.parse(tmpdir()).root),
    );

    assertStringIncludes(error.message, "must not be a filesystem root");
  });

  it("rejects storage directory user home directory", () => {
    const error = assertThrowsError(
      () => new FilesystemS3BucketStorage(homedir()),
    );

    assertStringIncludes(error.message, "must not be the user home directory");
  });

  it("rejects storage directory path with parent directory segment", () => {
    const error = assertThrowsError(
      () => new FilesystemS3BucketStorage(`${tmpdir()}/../public`),
    );

    assertStringIncludes(error.message, "must not contain '..'");
  });

  it("rejects storage directory path with unsafe directory name", async () => {
    const tempRootPath = await mkdtemp(path.join(tmpdir(), "yulin-s3-test-"));
    const directoryPath = path.join(tempRootPath, "private");

    const error = assertThrowsError(
      () => new FilesystemS3BucketStorage(directoryPath),
    );

    assertStringIncludes(error.message, "directory name must be one of");
  });

  it("rejects Object key with parent directory segment", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage(directoryPath);

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object("../secret.txt", Buffer.from("secret")),
      );
    });

    assertStringIncludes(error.message, "must not contain '..'");
  });

  it("allows custom safe storage directory names", async () => {
    const tempRootPath = await mkdtemp(path.join(tmpdir(), "yulin-s3-test-"));
    const directoryPath = path.join(tempRootPath, "private");

    const storage = new FilesystemS3BucketStorage(directoryPath, {
      allowedDirectoryNames: ["private"],
    });

    assertFalse(storage.allowChangeStorage());
  });

  it("rejects absolute Object key", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage(directoryPath);

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object(
          path.join(tmpdir(), "secret.txt"),
          Buffer.from("secret"),
        ),
      );
    });

    assertStringIncludes(error.message, "must not be an absolute path");
  });

  it("rejects Object key with unsupported file extension", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage(directoryPath);

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object("secret.pem", Buffer.from("secret")),
      );
    });

    assertStringIncludes(error.message, "unsupported file extension");
  });
});
