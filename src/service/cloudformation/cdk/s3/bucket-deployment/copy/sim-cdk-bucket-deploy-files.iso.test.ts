import { assertArrayLength, assertIdentical } from "@kensio/smartass";
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

  it("lists nothing for an empty asset directory", async () => {
    // Given a staged asset directory with nothing in it.
    const temporaryDirectory = new TemporaryDirectory();

    // When its files are listed, then there are none.
    const relativePaths = await simCdkBucketDeployFiles(
      await temporaryDirectory.resolvePath(),
    );

    assertArrayLength(relativePaths, 0);
  });
});
