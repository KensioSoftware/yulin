import { describe, it } from "vitest";
import path from "node:path";
import { homedir } from "node:os";
import {
  assertBufferEqual,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { FilesystemS3BucketStorage } from "./s3-filesystem-storage.js";
import { SimS3Object } from "../../object/s3-object.js";
import { TemporaryDirectory as TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";

describe("Filesystem simulated S3 storage safety", () => {
  it("rejects relative storage directory path", () => {
    const error = assertThrowsError(
      () => new FilesystemS3BucketStorage({ directoryPath: "public" }),
    );

    assertStringIncludes(error.message, "must be absolute");
  });

  it("rejects storage directory filesystem root", () => {
    const error = assertThrowsError(
      () =>
        new FilesystemS3BucketStorage({
          directoryPath: path.parse(homedir()).root,
        }),
    );

    assertStringIncludes(error.message, "must not be a filesystem root");
  });

  it("rejects storage directory user home directory", () => {
    const error = assertThrowsError(
      () => new FilesystemS3BucketStorage({ directoryPath: homedir() }),
    );

    assertStringIncludes(error.message, "must not be the user home directory");
  });

  it("rejects storage directory path with parent directory segment", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();

    const error = assertThrowsError(
      () =>
        new FilesystemS3BucketStorage({
          directoryPath: `${testDirectory.path()}/../public`,
        }),
    );

    assertStringIncludes(error.message, "must not contain '..'");
  });

  it("rejects storage directory path with unsafe directory name", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();
    const directoryPath = testDirectory.join("private");

    const error = assertThrowsError(
      () => new FilesystemS3BucketStorage({ directoryPath }),
    );

    assertStringIncludes(error.message, "directory name must be one of");
  });

  it("rejects Object key with parent directory segment", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
    });

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object({ key: "../secret.txt", body: Buffer.from("secret") }),
      );
    });

    assertStringIncludes(error.message, "must not contain '..'");
  });

  it("rejects absolute Object key", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
    });

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object({
          key: testDirectory.join("secret.txt"),
          body: Buffer.from("secret"),
        }),
      );
    });

    assertStringIncludes(error.message, "must not be an absolute path");
  });

  it("rejects Object key with unsupported file extension", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
    });

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object({ key: "secret.pem", body: Buffer.from("secret") }),
      );
    });

    assertStringIncludes(error.message, "unsupported file extension");
  });

  it("serves an extension the mount named", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
      additionalFileExtensions: [".freq"],
    });

    await storage.putObject(
      new SimS3Object({
        key: "data/standard.freq",
        body: Buffer.from([0, 1, 2]),
      }),
    );

    const stored = await storage.getObject("data/standard.freq");

    assertNonNullable(stored);
    assertBufferEqual(stored.body, Buffer.from([0, 1, 2]));
    // What S3 reports for an object whose type it was never told, which is
    // every extension a mount names for itself.
    assertIdentical(
      stored.metadata.values["content-type"],
      "application/octet-stream",
    );
  });

  // A caller thinking about their own files says `.freq` or `freq` without
  // meaning anything by the difference.
  it("takes an extension written without its dot", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
      additionalFileExtensions: ["FREQ"],
    });

    await storage.putObject(
      new SimS3Object({ key: "a.freq", body: Buffer.from([7]) }),
    );

    assertNonNullable(await storage.getObject("a.freq"));
  });

  // Adding one extension must not be a way to lose the web's own.
  it("keeps the default extensions when a mount adds one", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
      additionalFileExtensions: [".freq"],
    });

    await storage.putObject(
      new SimS3Object({ key: "index.html", body: Buffer.from("<p>hi</p>") }),
    );

    assertNonNullable(await storage.getObject("index.html"));
  });

  it("still refuses an extension nobody named", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
      additionalFileExtensions: [".freq"],
    });

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object({ key: "secret.pem", body: Buffer.from("secret") }),
      );
    });

    assertStringIncludes(error.message, "unsupported file extension");
  });

  // The GET path rather than the PUT one. A file with an unnamed extension can
  // already be sitting in the mounted directory, and what a browser asking for
  // it gets is nothing rather than an error.
  it("does not serve a file whose extension nobody named", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();
    await testDirectory.writeFile(["public", "secret.pem"], "secret");
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDirectory.join("public"),
      additionalFileExtensions: [".freq"],
    });

    assertUndefined(await storage.getObject("secret.pem"));
  });

  it("refuses an empty extension rather than widening the list", async () => {
    const testDirectory = new TemporaryDirectory();
    await testDirectory.resolvePath();

    const error = assertThrowsError(
      () =>
        new FilesystemS3BucketStorage({
          directoryPath: testDirectory.join("public"),
          additionalFileExtensions: [" "],
        }),
    );

    assertStringIncludes(error.message, "must not be empty");
  });
});
