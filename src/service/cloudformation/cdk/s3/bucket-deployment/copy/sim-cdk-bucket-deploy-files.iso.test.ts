import { symlink } from "node:fs/promises";
import path from "node:path";

import {
  assertArrayEmpty,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { TemporaryDirectory } from "../../../../../../util/filesystem/temporary-directory.js";
import { simCdkBucketDeployFiles } from "./sim-cdk-bucket-deploy-files.js";

describe("simCdkBucketDeployFiles", () => {
  it("lists nested files relative to the asset root", async () => {
    // Given a staged asset directory with files at more than one depth.
    const temporaryDirectory = new TemporaryDirectory();

    await temporaryDirectory.writeFile(["index.html"], "<h1>Hello</h1>");
    await temporaryDirectory.writeFile(["data", "standard.keys"], "keys");
    await temporaryDirectory.writeFile(
      ["data", "nested", "deep.keys"],
      "deeper",
    );

    // When its files are listed.
    const relativePaths = await simCdkBucketDeployFiles(
      await temporaryDirectory.resolvePath(),
    );

    // Then every file comes back as a path relative to the root, separated the
    // way both the filters and the Object keys are written.
    assertIdentical(
      relativePaths.toSorted((a, b) => a.localeCompare(b)).join(","),
      "data/nested/deep.keys,data/standard.keys,index.html",
    );
  });

  it("follows a symbolic link to a file", async () => {
    // Given a staged asset directory holding a link to a file beside it.
    const temporaryDirectory = new TemporaryDirectory();

    await temporaryDirectory.writeFile(["index.html"], "<h1>Hello</h1>");

    const rootPath = await temporaryDirectory.resolvePath();

    // oxlint-disable-next-line security/detect-non-literal-fs-filename -- both paths are inside this test's own temporary directory
    await symlink(
      path.join(rootPath, "index.html"),
      path.join(rootPath, "linked.html"),
    );

    // When its files are listed.
    const relativePaths = await simCdkBucketDeployFiles(rootPath);

    // Then the link is one of them, as `aws s3 sync` follows one by default.
    // Leaving it out would deploy a Bucket quietly missing a file.
    assertIdentical(
      relativePaths.toSorted((a, b) => a.localeCompare(b)).join(","),
      "index.html,linked.html",
    );
  });

  it("leaves out a symbolic link pointing at nothing", async () => {
    // Given a staged asset directory holding a broken link.
    const temporaryDirectory = new TemporaryDirectory();

    await temporaryDirectory.writeFile(["index.html"], "<h1>Hello</h1>");

    const rootPath = await temporaryDirectory.resolvePath();

    // oxlint-disable-next-line security/detect-non-literal-fs-filename -- both paths are inside this test's own temporary directory
    await symlink(
      path.join(rootPath, "gone.html"),
      path.join(rootPath, "broken.html"),
    );

    // When its files are listed, then the broken link is skipped rather than
    // failing the deployment, which is what the CLI does with one.
    const relativePaths = await simCdkBucketDeployFiles(rootPath);

    assertIdentical(relativePaths.join(","), "index.html");
  });

  it("refuses a symbolic link to a directory", async () => {
    // Given a staged asset directory holding a link to a directory.
    const temporaryDirectory = new TemporaryDirectory();

    await temporaryDirectory.writeFile(["data", "standard.keys"], "keys");

    const rootPath = await temporaryDirectory.resolvePath();

    // oxlint-disable-next-line security/detect-non-literal-fs-filename -- both paths are inside this test's own temporary directory
    await symlink(path.join(rootPath, "data"), path.join(rootPath, "linked"));

    // When its files are listed, then it is refused by name rather than
    // walked, since a link to an ancestor would be walked forever.
    const error = await assertThrowsErrorAsync(async () =>
      simCdkBucketDeployFiles(rootPath),
    );

    assertStringIncludes(error.message, "symbolic link to a directory");
  });

  it("lists nothing for an empty asset directory", async () => {
    // Given a staged asset directory with nothing in it.
    const temporaryDirectory = new TemporaryDirectory();

    // When its files are listed, then there are none.
    const relativePaths = await simCdkBucketDeployFiles(
      await temporaryDirectory.resolvePath(),
    );

    assertArrayEmpty(relativePaths);
  });
});
