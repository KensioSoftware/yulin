import path from "node:path";
import {
  assertDirectoryExists,
  assertFileEquals,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  makeTemporaryDirectory as makeTemporaryDirectory,
  TemporaryDirectory as TemporaryDirectory,
} from "./temporary-directory.js";

describe("Temp dir helper", () => {
  it("creates a temporary directory", async () => {
    // Given the temp dir helper.
    // When a temp directory is created.
    const tempDirPath = await makeTemporaryDirectory();

    // Then it exists on disk with the expected test prefix.
    assertDirectoryExists(tempDirPath);
    assertStringStartsWith(path.basename(tempDirPath), "yulin-test-");
  });

  it("throws when reading a TempDir path before it is resolved", () => {
    // Given a TempDir whose path has not been resolved yet.
    const temporaryDirectory = new TemporaryDirectory();

    // When the path is read before resolution.
    const error = assertThrowsError(() => {
      temporaryDirectory.path();
    });

    // Then the helper explains how to resolve it first.
    assertStringIncludes(
      error.message,
      "TempDir path has not yet been resolved",
    );
  });

  it("writes a file inside a TempDir", async () => {
    // Given a TempDir and a nested relative file path.
    const temporaryDirectory = new TemporaryDirectory();

    // When a file is written through the helper.
    await temporaryDirectory.writeFile(["nested", "hello.txt"], "hello!");

    // Then the helper creates parent directories and writes the file content.
    assertFileEquals(temporaryDirectory.join("nested", "hello.txt"), "hello!");
  });
});
