import { describe, it } from "vitest";
import path from "node:path";
import { homedir } from "node:os";
import {
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { FilesystemS3BucketStorage } from "./s3-filesystem-storage.js";
import { SimS3Object } from "../../object/s3-object.js";
import { TempDir } from "../../../../util/filesystem/temp-dir.js";

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
    const testDir = new TempDir();
    await testDir.resolvePath();

    const error = assertThrowsError(
      () =>
        new FilesystemS3BucketStorage({
          directoryPath: `${testDir.path()}/../public`,
        }),
    );

    assertStringIncludes(error.message, "must not contain '..'");
  });

  it("rejects storage directory path with unsafe directory name", async () => {
    const testDir = new TempDir();
    await testDir.resolvePath();
    const directoryPath = testDir.join("private");

    const error = assertThrowsError(
      () => new FilesystemS3BucketStorage({ directoryPath }),
    );

    assertStringIncludes(error.message, "directory name must be one of");
  });

  it("rejects Object key with parent directory segment", async () => {
    const testDir = new TempDir();
    await testDir.resolvePath();
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDir.join("public"),
    });

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object({ key: "../secret.txt", body: Buffer.from("secret") }),
      );
    });

    assertStringIncludes(error.message, "must not contain '..'");
  });

  it("rejects absolute Object key", async () => {
    const testDir = new TempDir();
    await testDir.resolvePath();
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDir.join("public"),
    });

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object({
          key: testDir.join("secret.txt"),
          body: Buffer.from("secret"),
        }),
      );
    });

    assertStringIncludes(error.message, "must not be an absolute path");
  });

  it("rejects Object key with unsupported file extension", async () => {
    const testDir = new TempDir();
    await testDir.resolvePath();
    const storage = new FilesystemS3BucketStorage({
      directoryPath: testDir.join("public"),
    });

    const error = await assertThrowsErrorAsync(async () => {
      await storage.putObject(
        new SimS3Object({ key: "secret.pem", body: Buffer.from("secret") }),
      );
    });

    assertStringIncludes(error.message, "unsupported file extension");
  });
});
