import path from "node:path";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimCfnResource } from "../../../../resource/sim-cfn-resource.js";
import type { SimCdkOutContext } from "../../../sim-cdk-out-context.js";
import { SimCdkBucketDeploySource } from "./sim-cdk-bucket-deploy-source.js";

describe("SimCdkBucketDeploySource", () => {
  it("resolves the filesystem source directory for a matching zip asset object key", () => {
    // Given a CDK assets manifest with a zip file asset destination object key.
    const source = new SimCdkBucketDeploySource();
    const templateDirectoryPath = path.join("tmp", "cdk.out");
    const cdkOutContext: SimCdkOutContext = {
      templateDirectoryPath,
      assetsManifestPath: path.join(
        templateDirectoryPath,
        "FooStack.assets.json",
      ),
      assetsManifest: {
        files: {
          abc123: {
            source: {
              path: "asset.abc123",
              packaging: "zip",
            },
            destinations: {
              "current_account-current_region": {
                objectKey: "abc123.zip",
              },
            },
          },
        },
      },
    };

    // When the source directory is resolved for the object key.
    const sourceDirectoryPath = source.sourceDirectoryPathForObjectKey(
      makeResource(),
      "abc123.zip",
      cdkOutContext,
    );

    // Then it resolves relative to the synthesized template directory.
    assertIdentical(
      sourceDirectoryPath,
      path.resolve(templateDirectoryPath, "asset.abc123"),
    );
  });

  it("finds matching object keys across multiple file asset destinations", () => {
    // Given a CDK assets manifest with several file assets and destinations.
    const source = new SimCdkBucketDeploySource();
    const templateDirectoryPath = path.join("tmp", "cdk.out");
    const cdkOutContext: SimCdkOutContext = {
      templateDirectoryPath,
      assetsManifestPath: path.join(
        templateDirectoryPath,
        "FooStack.assets.json",
      ),
      assetsManifest: {
        files: {
          first: {
            source: {
              path: "asset.first",
              packaging: "zip",
            },
            destinations: {
              "first-destination": {
                objectKey: "first.zip",
              },
            },
          },
          second: {
            source: {
              path: "asset.second",
              packaging: "zip",
            },
            destinations: {
              "second-destination": {
                objectKey: "second.zip",
              },
            },
          },
        },
      },
    };

    // When the second asset destination object key is resolved.
    const sourceDirectoryPath = source.sourceDirectoryPathForObjectKey(
      makeResource(),
      "second.zip",
      cdkOutContext,
    );

    // Then the matching file asset source directory is returned.
    assertIdentical(
      sourceDirectoryPath,
      path.resolve(templateDirectoryPath, "asset.second"),
    );
  });

  it("fails when no CDK assets manifest is available", () => {
    // Given no CDK out context.
    const source = new SimCdkBucketDeploySource();

    // When source directory resolution is attempted, then it fails with a
    // diagnostic message explaining how to provide CDK assembly metadata.
    const error = assertThrowsError(() =>
      source.sourceDirectoryPathForObjectKey(
        makeResource("DeploySite"),
        "abc123.zip",
        undefined,
      ),
    );

    assertStringIncludes(
      error.message,
      "Could not configure Custom::CDKBucketDeployment DeploySite.",
    );
    assertStringIncludes(error.message, "Referenced source object key:");
    assertStringIncludes(error.message, "abc123.zip");
    assertStringIncludes(error.message, "No CDK assets manifest is available.");
    assertStringIncludes(
      error.message,
      "Deploy from a synthesized CDK template file, or run `cdk synth` and ensure the cloud assembly is available.",
    );
  });

  it("fails when no matching file asset source path is found", () => {
    // Given a CDK assets manifest that does not contain the requested object key.
    const source = new SimCdkBucketDeploySource();
    const templateDirectoryPath = path.join("tmp", "cdk.out");
    const assetsManifestPath = path.join(
      templateDirectoryPath,
      "FooStack.assets.json",
    );
    const cdkOutContext: SimCdkOutContext = {
      templateDirectoryPath,
      assetsManifestPath,
      assetsManifest: {
        files: {
          abc123: {
            source: {
              path: "asset.abc123",
              packaging: "zip",
            },
            destinations: {
              "current_account-current_region": {
                objectKey: "abc123.zip",
              },
            },
          },
        },
      },
    };

    // When a missing source object key is resolved, then it fails with the
    // formatted BucketDeployment asset resolution error.
    const error = assertThrowsError(() =>
      source.sourceDirectoryPathForObjectKey(
        makeResource("DeploySite"),
        "missing.zip",
        cdkOutContext,
      ),
    );

    assertStringIncludes(
      error.message,
      "Could not configure Custom::CDKBucketDeployment DeploySite.",
    );
    assertStringIncludes(error.message, "Referenced source object key:");
    assertStringIncludes(error.message, "missing.zip");
    assertStringIncludes(error.message, "Expected asset metadata in:");
    assertStringIncludes(error.message, assetsManifestPath);
    assertStringIncludes(
      error.message,
      "No matching CDK file asset with a source path was found.",
    );
    assertStringIncludes(
      error.message,
      "Run `cdk synth` and ensure the cloud assembly is available.",
    );
  });

  it("fails when the matching file asset packaging is not zip", () => {
    // Given a CDK assets manifest with a matching non-zip file asset.
    const source = new SimCdkBucketDeploySource();
    const templateDirectoryPath = path.join("tmp", "cdk.out");
    const assetsManifestPath = path.join(
      templateDirectoryPath,
      "FooStack.assets.json",
    );
    const cdkOutContext: SimCdkOutContext = {
      templateDirectoryPath,
      assetsManifestPath,
      assetsManifest: {
        files: {
          abc123: {
            source: {
              path: "asset.abc123",
              packaging: "file",
            },
            destinations: {
              "current_account-current_region": {
                objectKey: "abc123.zip",
              },
            },
          },
        },
      },
    };

    // When the source directory is resolved, then unsupported packaging is
    // rejected with a diagnostic error.
    const error = assertThrowsError(() =>
      source.sourceDirectoryPathForObjectKey(
        makeResource("DeploySite"),
        "abc123.zip",
        cdkOutContext,
      ),
    );

    assertStringIncludes(
      error.message,
      'Expected CDK file asset packaging "zip", got file.',
    );
  });

  it("fails when the matching file asset source path escapes the template directory", () => {
    // Given a CDK assets manifest with a matching zip file asset whose source path
    // attempts to traverse outside the synthesized template directory.
    const source = new SimCdkBucketDeploySource();
    const templateDirectoryPath = path.join("tmp", "cdk.out");
    const assetsManifestPath = path.join(
      templateDirectoryPath,
      "FooStack.assets.json",
    );
    const cdkOutContext: SimCdkOutContext = {
      templateDirectoryPath,
      assetsManifestPath,
      assetsManifest: {
        files: {
          abc123: {
            source: {
              path: path.join("..", "..", "outside-template"),
              packaging: "zip",
            },
            destinations: {
              "current_account-current_region": {
                objectKey: "abc123.zip",
              },
            },
          },
        },
      },
    };

    // When the source directory is resolved, then path traversal outside the
    // template directory is rejected with a diagnostic error.
    const error = assertThrowsError(() =>
      source.sourceDirectoryPathForObjectKey(
        makeResource("DeploySite"),
        "abc123.zip",
        cdkOutContext,
      ),
    );

    assertStringIncludes(
      error.message,
      "Could not configure Custom::CDKBucketDeployment DeploySite.",
    );
    assertStringIncludes(error.message, "Referenced source object key:");
    assertStringIncludes(error.message, "abc123.zip");
    assertStringIncludes(error.message, "Expected asset metadata in:");
    assertStringIncludes(error.message, assetsManifestPath);
    assertStringIncludes(
      error.message,
      "CDK file asset source path escapes the template directory:",
    );
    assertStringIncludes(
      error.message,
      path.join("..", "..", "outside-template"),
    );
  });
});

function makeResource(logicalId = "DeploySite"): SimCfnResource {
  return {
    logicalId,
  } as SimCfnResource;
}
