import { describe, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  assertFalse,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { FilesystemS3BucketStorage } from "./s3-filesystem-storage.js";
import { SimS3Object } from "../../object/s3-object.js";
import { makeTempDir } from "../../../../util/filesystem/temp-dir.js";

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
          directoryPath: path.parse(tmpdir()).root,
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

  it("rejects storage directory path with parent directory segment", () => {
    const error = assertThrowsError(
      () =>
        new FilesystemS3BucketStorage({
          directoryPath: `${tmpdir()}/../public`,
        }),
    );

    assertStringIncludes(error.message, "must not contain '..'");
  });

  it("rejects storage directory path with unsafe directory name", async () => {
    const tempRootPath = await mkdtemp(path.join(tmpdir(), "yulin-s3-test-"));
    const directoryPath = path.join(tempRootPath, "private");

    const error = assertThrowsError(
      () => new FilesystemS3BucketStorage({ directoryPath }),
    );

    assertStringIncludes(error.message, "directory name must be one of");
  });

  it("rejects Object key with parent directory segment", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage({ directoryPath });

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object({ key: "../secret.txt", body: Buffer.from("secret") }),
      );
    });

    assertStringIncludes(error.message, "must not contain '..'");
  });

  it("allows custom safe storage directory names", async () => {
    const tempRootPath = await mkdtemp(path.join(tmpdir(), "yulin-s3-test-"));
    const directoryPath = path.join(tempRootPath, "private");

    const storage = new FilesystemS3BucketStorage({
      directoryPath,
      allowedDirectoryNames: ["private"],
    });

    assertFalse(storage.allowChangeStorage());
  });

  it("rejects absolute Object key", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage({ directoryPath });

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object({
          key: path.join(tmpdir(), "secret.txt"),
          body: Buffer.from("secret"),
        }),
      );
    });

    assertStringIncludes(error.message, "must not be an absolute path");
  });

  it("rejects Object key with unsupported file extension", async () => {
    const directoryPath = await makeTempDir();
    const storage = new FilesystemS3BucketStorage({ directoryPath });

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object({ key: "secret.pem", body: Buffer.from("secret") }),
      );
    });

    assertStringIncludes(error.message, "unsupported file extension");
  });
});
