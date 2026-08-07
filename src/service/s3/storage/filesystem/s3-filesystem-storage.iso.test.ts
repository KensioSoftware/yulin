import { describe, it } from "vitest";
import { symlink } from "node:fs/promises";
import {
  assertArrayLength,
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { SimS3NotImplemented } from "../../error/sim-s3.error.js";
import { FilesystemS3BucketStorage } from "./s3-filesystem-storage.js";
import { SimS3Object } from "../../object/s3-object.js";
import { TemporaryDirectory as TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";

describe("Filesystem simulated S3 storage", () => {
  async function makeFilesystemStorage(): Promise<FilesystemS3BucketStorage> {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();

    return new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
    });
  }

  it("puts and gets an Object from the filesystem", async () => {
    const storage = await makeFilesystemStorage();

    const body = Buffer.from("Hello, world!");

    await storage.putObject(new SimS3Object({ key: "foo.txt", body }));

    const object = await storage.getObject("foo.txt");

    assertNonNullable(object);
    assertIdentical(object.key, "foo.txt");
    assertBufferEqual(object.body, body);
  });

  it("gets undefined for missing Object", async () => {
    const storage = await makeFilesystemStorage();

    const object = await storage.getObject("missing.txt");

    assertUndefined(object);
  });

  it("lists no Objects when storage directory does not exist", async () => {
    const storage = await makeFilesystemStorage();
    const objects = await storage.listObjects();

    assertArrayLength(objects, 0);
  });

  it("lists Objects from the filesystem", async () => {
    const storage = await makeFilesystemStorage();

    await storage.putObject(
      new SimS3Object({ key: "foo/a.txt", body: Buffer.from("a") }),
    );
    await storage.putObject(
      new SimS3Object({ key: "foo/b.txt", body: Buffer.from("b") }),
    );
    await storage.putObject(
      new SimS3Object({ key: "bar/c.txt", body: Buffer.from("c") }),
    );

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
    const storage = await makeFilesystemStorage();

    await storage.putObject(
      new SimS3Object({ key: "foo/a.txt", body: Buffer.from("a") }),
    );
    await storage.putObject(
      new SimS3Object({ key: "foo/b.txt", body: Buffer.from("b") }),
    );
    await storage.putObject(
      new SimS3Object({ key: "bar/c.txt", body: Buffer.from("c") }),
    );

    const objects = await storage.listObjects("foo/");
    const keys = objects
      .map((object) => object.key)
      .toSorted((a, b) => a.localeCompare(b));

    assertArrayLength(keys, 2);
    assertIdentical(keys[0], "foo/a.txt");
    assertIdentical(keys[1], "foo/b.txt");
  });

  it("makes up reasonable Object metadata from file extension", async () => {
    const storage = await makeFilesystemStorage();

    await storage.putObject(
      new SimS3Object({
        key: "index.html",
        body: Buffer.from("<h1>Hello</h1>"),
      }),
    );

    const object = await storage.getObject("index.html");

    assertNonNullable(object);
    assertIdentical(object.metadata.values["content-type"], "text/html");
  });

  it.each([
    ["style.css", "text/css"],
    ["font.eot", "application/vnd.ms-fontobject"],
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
    ["font.otf", "font/otf"],
    ["image.svg", "image/svg+xml"],
    ["font.ttc", "font/collection"],
    ["font.ttf", "font/ttf"],
    ["note.txt", "text/plain"],
    ["image.webp", "image/webp"],
    ["font.woff", "font/woff"],
    ["font.woff2", "font/woff2"],
    ["feed.xml", "application/xml"],
  ])("makes up %s Object content type metadata", async (key, contentType) => {
    const storage = await makeFilesystemStorage();

    await storage.putObject(new SimS3Object({ key, body: Buffer.from(key) }));

    const object = await storage.getObject(key);

    assertNonNullable(object);
    assertIdentical(object.metadata.values["content-type"], contentType);
  });

  it("ignores unsupported file extensions when listing Objects", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.writeFile(["public", "safe.txt"], "safe");
    await testDirectory.writeFile(["public", "unsafe.pem"], "unsafe");

    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
    });
    const objects = await storage.listObjects();

    assertArrayLength(objects, 1);
    assertIdentical(objects[0].key, "safe.txt");
  });

  it("ignores symlinks when listing Objects", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.writeFile(["public", "safe.txt"], "safe");
    await testDirectory.writeFile("outside.txt", "outside");

    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    await symlink(
      testDirectory.join("outside.txt"),
      testDirectory.join("public", "linked.txt"),
    );

    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
    });
    const objects = await storage.listObjects();

    assertArrayLength(objects, 1);
    assertIdentical(objects[0].key, "safe.txt");
  });

  it("refuses to delete an Object rather than unlinking the file", async () => {
    // Given a file backing a simulated Object
    const testDirectory = new TemporaryDirectory();
    await testDirectory.writeFile(["public", "keep.txt"], "keep");

    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
    });

    // When the Object is deleted
    const error = await assertThrowsErrorAsync(async () => {
      await storage.deleteObject("keep.txt");
    });

    // Then the refusal is reported, and the file is still there
    assertInstanceOf(error, SimS3NotImplemented);
    assertStringIncludes(error.message, "will not delete keep.txt");
    assertNonNullable(await storage.getObject("keep.txt"));
  });
});
